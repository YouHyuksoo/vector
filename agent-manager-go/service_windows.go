/**
 * @file service_windows.go
 * @description Windows 서비스 인터페이스 구현 — SCM과 통신하여 서비스로 동작
 *
 * 초보자 가이드:
 * - Windows 서비스로 등록된 프로그램은 SCM(서비스 제어 관리자)과 통신해야 함
 * - svc.Handler 인터페이스의 Execute 메서드를 구현하여 Start/Stop 등 제어 처리
 * - main()에서 IsWindowsService()로 서비스 모드 자동 감지
 */
package main

import (
	"log"
	"net/http"
	"time"

	"golang.org/x/sys/windows/svc"
)

const serviceName = "VectorAgentManager"

// agentService는 svc.Handler 인터페이스를 구현
type agentService struct{}

// Execute — SCM이 호출하는 서비스 메인 루프
func (m *agentService) Execute(args []string, r <-chan svc.ChangeRequest, s chan<- svc.Status) (bool, uint32) {
	// 수락 가능한 명령: Stop, Shutdown
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown

	// 1. StartPending → Running
	s <- svc.Status{State: svc.StartPending}

	// 로그 설정
	setupLogFile()
	logStartupInfo()

	// HTTP 서버 준비
	addr := "0.0.0.0:" + port
	server := buildHTTPServer(addr)

	// Heartbeat 시작
	go startHeartbeat()

	// HTTP 서버를 goroutine에서 시작
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("Agent Manager service running at http://localhost:%s", port)
		serverErr <- server.ListenAndServe()
	}()

	// Running 상태 알림
	s <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}
	log.Println("[Service] VectorAgentManager is now RUNNING")

	// 2. 메인 루프 — Stop/Shutdown 대기
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				s <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				log.Println("[Service] Stop/Shutdown signal received")
				s <- svc.Status{State: svc.StopPending}
				// HTTP 서버 종료
				server.Close()
				return false, 0
			}
		case err := <-serverErr:
			if err != nil && err != http.ErrServerClosed {
				log.Printf("[Service] HTTP server error: %v", err)
			}
			return false, 1
		}
	}
}

// runAsService — svc.Run을 호출하여 SCM 핸드셰이크 수행
func runAsService() {
	log.Println("[Service] Starting as Windows service...")
	err := svc.Run(serviceName, &agentService{})
	if err != nil {
		log.Fatalf("[Service] Failed to run service: %v", err)
	}
}

// isWindowsService — 현재 프로세스가 Windows 서비스로 실행 중인지 감지
func isWindowsService() bool {
	// Go 1.20의 x/sys에서는 IsAnInteractiveSession 사용
	// (IsWindowsService는 더 높은 버전에서 추가됨)
	interactive, err := svc.IsAnInteractiveSession()
	if err != nil {
		log.Printf("[Service] Cannot determine session type: %v", err)
		return false
	}
	return !interactive
}

// buildHTTPServer — http.Server 인스턴스 생성 (graceful shutdown 지원)
func buildHTTPServer(addr string) *http.Server {
	mux := buildMux()
	return &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}
}
