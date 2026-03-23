// Vector Agent Manager — Go 단일 바이너리 (Win7 32-bit ~ Win11 64-bit)
//
// 빌드: go build -o agent-manager.exe .
// 크로스 컴파일: GOOS=windows GOARCH=386 go build (32-bit)
package main

import (
	"archive/zip"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/getlantern/systray"
)

//go:embed public/*
var publicFS embed.FS

// ─── 환경 설정 ───

var (
	port          = envOr("PORT", "9090")
	vectorAPI     = envOr("VECTOR_API_URL", "http://127.0.0.1:8686")
	masterServer  = envOr("MASTER_SERVER_URL", "http://20.10.30.112:3100")
	vectorBinPath string
	configDir     string
)

func init() {
	configDir = envOr("VECTOR_CONFIG_DIR", `C:\vector`)
	vectorBinPath = envOr("VECTOR_BIN_PATH", filepath.Join(configDir, "vector.exe"))
	loadConfig() // config.json에서 masterServer 로드
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ─── config.json 관리 ───

type AppConfig struct {
	MasterServer string `json:"masterServer"`
}

func configFilePath() string {
	return filepath.Join(configDir, "config.json")
}

func loadConfig() {
	os.MkdirAll(configDir, 0755)
	data, err := os.ReadFile(configFilePath())
	if err != nil {
		// 첫 실행: 기본값으로 config.json 생성
		saveConfig()
		return
	}
	var cfg AppConfig
	if json.Unmarshal(data, &cfg) == nil && cfg.MasterServer != "" {
		masterServer = cfg.MasterServer
	}
}

func saveConfig() {
	cfg := AppConfig{MasterServer: masterServer}
	data, _ := json.MarshalIndent(cfg, "", "  ")
	os.MkdirAll(configDir, 0755)
	os.WriteFile(configFilePath(), data, 0644)
}

// ─── TOML 탐색 ───

func findTomlConfig() string {
	if v := os.Getenv("VECTOR_CONFIG_PATH"); v != "" {
		return v
	}
	entries, err := os.ReadDir(configDir)
	if err != nil {
		return filepath.Join(configDir, "vector.toml")
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".toml") && !strings.HasSuffix(e.Name(), ".bak.toml") {
			return filepath.Join(configDir, e.Name())
		}
	}
	return filepath.Join(configDir, "vector.toml")
}

// ─── Vector PID 찾기 ───

func findVectorPID() string {
	cmd := exec.Command("tasklist", "/FI", "IMAGENAME eq vector.exe", "/FO", "CSV", "/NH")
	cmd.SysProcAttr = windowsHideAttr()
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(strings.ToLower(line), "vector.exe") {
			parts := strings.Split(line, ",")
			if len(parts) >= 2 {
				return strings.Trim(parts[1], `"`)
			}
		}
	}
	return ""
}

// ─── JSON 유틸 ───

func jsonResp(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func readBody(r *http.Request) map[string]string {
	m := map[string]string{}
	json.NewDecoder(r.Body).Decode(&m)
	return m
}

// ─── TOML 파싱 유틸 ───

func tomlGetMeta(content, key string) string {
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "."+key+" ") || strings.HasPrefix(line, "."+key+"=") {
			idx := strings.Index(line, `"`)
			if idx < 0 {
				continue
			}
			end := strings.Index(line[idx+1:], `"`)
			if end < 0 {
				continue
			}
			return line[idx+1 : idx+1+end]
		}
	}
	return ""
}

func tomlSetMeta(content, key, value string) string {
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "."+key+" ") || strings.HasPrefix(trimmed, "."+key+"=") {
			idx := strings.Index(line, `"`)
			if idx < 0 {
				continue
			}
			end := strings.Index(line[idx+1:], `"`)
			if end < 0 {
				continue
			}
			lines[i] = line[:idx+1] + value + line[idx+1+end:]
			break
		}
	}
	return strings.Join(lines, "\n")
}

func tomlGetHeartbeatTag(content, key string) string {
	inTags := false
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "[sources.heartbeat.metrics.tags]") {
			inTags = true
			continue
		}
		if inTags && strings.HasPrefix(trimmed, "[") {
			break
		}
		if inTags && strings.HasPrefix(trimmed, key+" ") || (inTags && strings.HasPrefix(trimmed, key+"=")) {
			idx := strings.Index(trimmed, `"`)
			if idx < 0 {
				continue
			}
			end := strings.Index(trimmed[idx+1:], `"`)
			if end < 0 {
				continue
			}
			return trimmed[idx+1 : idx+1+end]
		}
	}
	return ""
}

func tomlSetHeartbeatTag(content, key, value string) string {
	lines := strings.Split(content, "\n")
	inTags := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "[sources.heartbeat.metrics.tags]") {
			inTags = true
			continue
		}
		if inTags && strings.HasPrefix(trimmed, "[") {
			break
		}
		if inTags && (strings.HasPrefix(trimmed, key+" ") || strings.HasPrefix(trimmed, key+"=")) {
			idx := strings.Index(line, `"`)
			if idx < 0 {
				continue
			}
			end := strings.Index(line[idx+1:], `"`)
			if end < 0 {
				continue
			}
			lines[i] = line[:idx+1] + value + line[idx+1+end:]
			break
		}
	}
	return strings.Join(lines, "\n")
}

func tomlGetSinkAddr(content string) (string, string) {
	inSink := false
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "[sinks.to_aggregator]") {
			inSink = true
			continue
		}
		if inSink && strings.HasPrefix(trimmed, "[") {
			break
		}
		if inSink && strings.HasPrefix(trimmed, "address") {
			idx := strings.Index(trimmed, `"`)
			if idx < 0 {
				continue
			}
			end := strings.Index(trimmed[idx+1:], `"`)
			if end < 0 {
				continue
			}
			addr := trimmed[idx+1 : idx+1+end]
			parts := strings.Split(addr, ":")
			if len(parts) >= 2 {
				return parts[0], parts[len(parts)-1]
			}
		}
	}
	return "", ""
}

func tomlSetSinkAddr(content, ip, port string) string {
	lines := strings.Split(content, "\n")
	inSink := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "[sinks.to_aggregator]") {
			inSink = true
			continue
		}
		if inSink && strings.HasPrefix(trimmed, "[") {
			break
		}
		if inSink && strings.HasPrefix(trimmed, "address") {
			idx := strings.Index(line, `"`)
			if idx < 0 {
				continue
			}
			end := strings.Index(line[idx+1:], `"`)
			if end < 0 {
				continue
			}
			lines[i] = line[:idx+1] + ip + ":" + port + line[idx+1+end:]
			break
		}
	}
	return strings.Join(lines, "\n")
}

func tomlGetInclude(content string) string {
	idx := strings.Index(content, "include = [")
	if idx < 0 {
		return ""
	}
	end := strings.Index(content[idx:], "]")
	if end < 0 {
		return ""
	}
	block := content[idx : idx+end+1]
	var paths []string
	for _, line := range strings.Split(block, "\n") {
		line = strings.TrimSpace(line)
		line = strings.Trim(line, `"',`)
		line = strings.TrimSpace(line)
		if line != "" && line != "include = [" && line != "]" {
			paths = append(paths, strings.ReplaceAll(line, `\\`, `\`))
		}
	}
	return strings.Join(paths, "\n")
}

func tomlSetInclude(content, paths string) string {
	idx := strings.Index(content, "include = [")
	if idx < 0 {
		return content
	}
	end := strings.Index(content[idx:], "]")
	if end < 0 {
		return content
	}
	var lines []string
	for _, p := range strings.Split(paths, "\n") {
		p = strings.TrimSpace(p)
		if p != "" {
			lines = append(lines, fmt.Sprintf("  '%s',", p))
		}
	}
	newBlock := "include = [\n" + strings.Join(lines, "\n") + "\n]"
	return content[:idx] + newBlock + content[idx+end+1:]
}

// ─── 메인 ───

// 포트가 이미 사용 중인지 확인 (서비스가 떠있는지)
func isPortInUse() bool {
	ln, err := net.Listen("tcp", "0.0.0.0:"+port)
	if err != nil {
		return true
	}
	ln.Close()
	return false
}

func main() {
	// --no-tray 플래그면 서비스 모드 (HTTP 서버만)
	for _, arg := range os.Args[1:] {
		if arg == "--no-tray" || arg == "--console" {
			startServer()
			return
		}
	}
	systray.Run(onTrayReady, onTrayExit)
}

func onTrayExit() {}

// 로그 파일 경로
var logFilePath string

// crlfWriter는 \n을 \r\n으로 변환하여 Windows 메모장에서 줄바꿈이 보이게 함
type crlfWriter struct {
	f *os.File
}

func (w *crlfWriter) Write(p []byte) (int, error) {
	out := strings.ReplaceAll(string(p), "\n", "\r\n")
	return w.f.WriteString(out)
}

const maxLogSize = 5 * 1024 * 1024 // 5MB

// limitedWriter — 파일 크기가 maxSize 초과 시 후반만 남기고 자동 정리
type limitedWriter struct {
	f       *os.File
	path    string
	maxSize int64
	written int64
}

func (w *limitedWriter) Write(p []byte) (int, error) {
	n, err := w.f.Write(p)
	w.written += int64(n)
	// 1MB마다 크기 체크 (매 write마다 하면 낭비)
	if w.written > 1024*1024 {
		w.written = 0
		info, e := w.f.Stat()
		if e == nil && info.Size() > w.maxSize {
			w.f.Close()
			trimLogFile(w.path)
			w.f, _ = os.OpenFile(w.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		}
	}
	return n, err
}

func trimLogFile(path string) {
	info, err := os.Stat(path)
	if err != nil || info.Size() < maxLogSize {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	// 후반 절반만 유지
	half := len(data) / 2
	idx := strings.Index(string(data[half:]), "\n")
	if idx >= 0 {
		os.WriteFile(path, data[half+idx+1:], 0644)
	}
}

func setupLogFile() {
	logDir := configDir
	os.MkdirAll(logDir, 0755)
	logFilePath = filepath.Join(logDir, "agent-manager.log")
	trimLogFile(logFilePath)
	f, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err == nil {
		cw := &crlfWriter{f: f}
		log.SetOutput(cw)
		os.Stdout = f
		os.Stderr = f
	}
}

func onTrayReady() {
	// 로그 파일 설정
	setupLogFile()

	// 트레이 아이콘 설정
	iconData, _ := publicFS.ReadFile("public/icon.ico")
	if len(iconData) > 0 {
		systray.SetIcon(iconData)
	}
	systray.SetTitle("Agent Manager")
	systray.SetTooltip("Vector Agent Manager - localhost:" + port)

	mOpen := systray.AddMenuItem("Open Browser", "Open Agent Manager in browser")
	mLog := systray.AddMenuItem("Agent Log", "Open Agent Manager log file")
	mVectorLog := systray.AddMenuItem("Vector Log", "Open Vector log file")
	systray.AddSeparator()
	mSvcVector := systray.AddMenuItem("Service: VectorAgent — checking...", "")
	mSvcManager := systray.AddMenuItem("Service: AgentManager — checking...", "")
	systray.AddSeparator()
	mStatus := systray.AddMenuItem("Status: Starting...", "")
	mStatus.Disable()
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Close Agent Manager tray")

	// 서비스가 이미 떠있으면 HTTP 서버 안 띄움 (트레이만)
	serviceRunning := isPortInUse()
	if serviceRunning {
		mStatus.SetTitle("Status: Service running (tray only)")
		log.Println("[Tray] Service already running — tray only mode")
	} else {
		go startServer()
	}

	// 서비스 상태 초기 조회
	updateSvcMenu := func() {
		mSvcVector.SetTitle("Service: VectorAgent — " + svcStateLabel(getServiceState("VectorAgent")))
		mSvcManager.SetTitle("Service: AgentManager — " + svcStateLabel(getServiceState("VectorAgentManager")))
	}
	go updateSvcMenu()

	// 메뉴 이벤트 처리
	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				exec.Command("rundll32", "url.dll,FileProtocolHandler", "http://localhost:"+port).Start()
			case <-mLog.ClickedCh:
				exec.Command("notepad", logFilePath).Start()
			case <-mVectorLog.ClickedCh:
				exec.Command("notepad", filepath.Join(configDir, "vector.log")).Start()
			case <-mSvcVector.ClickedCh:
				toggleService("VectorAgent", vectorBinPath+" --config "+findTomlConfig())
				updateSvcMenu()
			case <-mSvcManager.ClickedCh:
				exePath, _ := os.Executable()
				toggleService("VectorAgentManager", exePath+" --no-tray")
				updateSvcMenu()
			case <-mQuit.ClickedCh:
				systray.Quit()
				os.Exit(0)
			}
		}
	}()

	// 상태 업데이트
	go func() {
		time.Sleep(2 * time.Second)
		if !serviceRunning {
			mStatus.SetTitle("Status: Running (:" + port + ")")
		}
	}()
}

func startServer() {
	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		jsonResp(w, map[string]string{"status": "ok", "timestamp": time.Now().UTC().Format(time.RFC3339)})
	})

	// ─── Status ───
	mux.HandleFunc("/api/status", handleStatus)
	mux.HandleFunc("/api/metrics", handleMetrics)

	// ─── Setup (설비 정보) ───
	mux.HandleFunc("/api/setup", handleSetup)

	// ─── Config (TOML 직접 편집) ───
	mux.HandleFunc("/api/config", handleConfig)

	// ─── Vector 프로세스 제어 ───
	mux.HandleFunc("/api/vector/start", handleVectorStart)
	mux.HandleFunc("/api/vector/stop", handleVectorStop)
	mux.HandleFunc("/api/vector/restart", handleVectorRestart)
	mux.HandleFunc("/api/vector/test-connection", handleTestConnection)

	// ─── Install ───
	mux.HandleFunc("/api/install/status", handleInstallStatus)
	mux.HandleFunc("/api/install", handleInstall)

	// ─── Update ───
	mux.HandleFunc("/api/update/check", handleUpdateCheck)
	mux.HandleFunc("/api/update/execute", handleUpdateExecute)

	// ─── Service ───
	mux.HandleFunc("/api/service/status", handleServiceStatus)
	mux.HandleFunc("/api/service/install", handleServiceInstall)
	mux.HandleFunc("/api/service/uninstall", handleServiceUninstall)

	// ─── Vector 로그 ───
	mux.HandleFunc("/api/vector-log", handleVectorLog)

	// ─── TOML 목록/다운로드 ───
	mux.HandleFunc("/api/toml-list", handleTomlList)
	mux.HandleFunc("/api/toml-download", handleTomlDownload)

	// ─── Logs ───
	mux.HandleFunc("/api/logs/recent", handleLogsRecent)

	// ─── Server Config (서버 주소 조회/변경) ───
	mux.HandleFunc("/api/server-config", handleServerConfig)

	// 정적 파일 서빙 (임베딩 — 반드시 마지막에 등록)
	staticFS, _ := fs.Sub(publicFS, "public")
	mux.Handle("/", http.FileServer(http.FS(staticFS)))

	// 서버 시작
	addr := "0.0.0.0:" + port

	// --no-tray 모드일 때만 로그 설정 (트레이 모드는 onTrayReady에서 이미 호출)
	if logFilePath == "" {
		setupLogFile()
	}

	log.Printf("Agent Manager (Go) running at http://localhost:%s", port)
	log.Printf("  Vector API:    %s", vectorAPI)
	log.Printf("  Config path:   %s", findTomlConfig())
	log.Printf("  Vector binary: %s", vectorBinPath)
	log.Printf("  Master server: %s", masterServer)
	log.Printf("  Edition:       %s (arch=%s)", detectEdition(), runtime.GOARCH)

	// Vector 미설치 시 안내 (자동 설치 X → 웹 UI에서 수동 설치)
	if _, err := os.Stat(vectorBinPath); err != nil {
		log.Printf("[Init] Vector not found at %s — install via web UI", vectorBinPath)
	}

	// Heartbeat: 30초마다 서버에 설비 상태 전송
	go startHeartbeat()

	log.Fatal(http.ListenAndServe(addr, mux))
}

// ─── Status API ───

func handleStatus(w http.ResponseWriter, r *http.Request) {
	pid := findVectorPID()
	running := pid != ""

	result := map[string]any{
		"running":   running,
		"pid":       pid,
		"component": "sources",
	}

	if running {
		// Vector API에서 상세 정보
		resp, err := httpGet(vectorAPI + "/api/v1/status/health")
		if err == nil {
			result["vectorAPI"] = true
			resp.Body.Close()
		}
	}

	jsonResp(w, result)
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	result := map[string]any{
		"events_in":   0,
		"events_out":  0,
		"errors":      0,
		"buffer_pct":  0,
		"buffer_used": 0,
		"buffer_max":  0,
	}

	pid := findVectorPID()
	if pid == "" {
		jsonResp(w, result)
		return
	}

	// Vector GraphQL API로 메트릭 조회 (v0.45 edges.node 패턴 먼저, 실패 시 v0.38 flat 패턴)
	query45 := `{"query":"{ sources { edges { node { metrics { receivedEventsTotal { receivedEventsTotal } } } } } sinks { edges { node { metrics { sentEventsTotal { sentEventsTotal } sentBytesTotal { sentBytesTotal } } } } } }"}`
	query38 := `{"query":"{ sources { metrics { receivedEventsTotal { receivedEventsTotal } } } sinks { metrics { sentEventsTotal { sentEventsTotal } sentBytesTotal { sentBytesTotal } } } }"}`

	for _, query := range []string{query45, query38} {
		resp, err := http.Post(vectorAPI+"/graphql", "application/json", strings.NewReader(query))
		if err != nil {
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var gql map[string]any
		if json.Unmarshal(body, &gql) != nil {
			continue
		}
		data, ok := gql["data"].(map[string]any)
		if !ok || data == nil {
			continue
		}

		// 메트릭 노드 목록 추출 (v0.45: edges.node / v0.38: flat array)
		getNodes := func(section map[string]any) []map[string]any {
			var nodes []map[string]any
			if edges, ok := section["edges"].([]any); ok {
				for _, e := range edges {
					if em, ok := e.(map[string]any); ok {
						if n, ok := em["node"].(map[string]any); ok {
							nodes = append(nodes, n)
						}
					}
				}
			} else if arr, ok := section["metrics"].(map[string]any); ok {
				nodes = append(nodes, map[string]any{"metrics": arr})
			}
			return nodes
		}

		getFloat := func(m map[string]any, key string) float64 {
			if sub, ok := m[key].(map[string]any); ok {
				if v, ok := sub[key].(float64); ok {
					return v
				}
			}
			return 0
		}

		if sources, ok := data["sources"].(map[string]any); ok {
			var totalIn float64
			for _, n := range getNodes(sources) {
				if m, ok := n["metrics"].(map[string]any); ok {
					totalIn += getFloat(m, "receivedEventsTotal")
				}
			}
			result["events_in"] = int(totalIn)
		}
		if sinks, ok := data["sinks"].(map[string]any); ok {
			var totalOut, totalBytes float64
			for _, n := range getNodes(sinks) {
				if m, ok := n["metrics"].(map[string]any); ok {
					totalOut += getFloat(m, "sentEventsTotal")
					totalBytes += getFloat(m, "sentBytesTotal")
				}
			}
			result["events_out"] = int(totalOut)
			result["buffer_used"] = int(totalBytes)
		}
		break // 성공하면 루프 종료
	}

	jsonResp(w, result)
}

// ─── Setup API ───

func handleSetup(w http.ResponseWriter, r *http.Request) {
	cfgPath := findTomlConfig()

	if r.Method == "GET" {
		content, err := os.ReadFile(cfgPath)
		if err != nil {
			jsonError(w, 404, "Config file not found")
			return
		}
		s := string(content)
		sinkIP, sinkPort := tomlGetSinkAddr(s)
		jsonResp(w, map[string]string{
			"equipment_id":   tomlGetMeta(s, "equipment_id"),
			"equipment_type": tomlGetMeta(s, "equipment_type"),
			"ip":             tomlGetHeartbeatTag(s, "ip"),
			"line_code":      tomlGetMeta(s, "line_code"),
			"log_type":       tomlGetMeta(s, "log_type"),
			"include_paths":  tomlGetInclude(s),
			"sink_address":   sinkIP,
			"sink_port":      sinkPort,
		})
		return
	}

	if r.Method == "PUT" {
		content, err := os.ReadFile(cfgPath)
		if err != nil {
			jsonError(w, 404, "Config file not found")
			return
		}

		// 백업
		os.WriteFile(cfgPath+".bak", content, 0644)

		s := string(content)
		body := readBody(r)

		for _, key := range []string{"equipment_id", "equipment_type", "line_code", "log_type"} {
			if v, ok := body[key]; ok {
				s = tomlSetMeta(s, key, v)
				s = tomlSetHeartbeatTag(s, key, v)
			}
		}
		if v, ok := body["ip"]; ok {
			s = tomlSetHeartbeatTag(s, "ip", v)
		}
		if v, ok := body["include_paths"]; ok {
			s = tomlSetInclude(s, v)
		}
		curIP, curPort := tomlGetSinkAddr(s)
		if v, ok := body["sink_address"]; ok {
			curIP = v
		}
		if v, ok := body["sink_port"]; ok {
			curPort = v
		}
		s = tomlSetSinkAddr(s, curIP, curPort)

		os.WriteFile(cfgPath, []byte(s), 0644)
		jsonResp(w, map[string]any{"success": true, "message": "설비 정보가 TOML에 반영되었습니다."})
		return
	}
}

// ─── Config API ───

func handleConfig(w http.ResponseWriter, r *http.Request) {
	cfgPath := findTomlConfig()

	if r.Method == "GET" {
		content, err := os.ReadFile(cfgPath)
		if err != nil {
			jsonError(w, 404, "Config file not found")
			return
		}
		jsonResp(w, map[string]string{"content": string(content), "path": cfgPath})
		return
	}

	if r.Method == "PUT" {
		body := map[string]string{}
		json.NewDecoder(r.Body).Decode(&body)
		content := body["content"]
		if content == "" {
			jsonError(w, 400, "content is required")
			return
		}
		old, _ := os.ReadFile(cfgPath)
		os.WriteFile(cfgPath+".bak", old, 0644)
		os.WriteFile(cfgPath, []byte(content), 0644)
		jsonResp(w, map[string]any{"success": true, "message": "설정이 저장되었습니다."})
		return
	}
}

// ─── Vector 제어 ───

func handleVectorStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}
	if _, err := os.Stat(vectorBinPath); os.IsNotExist(err) {
		jsonError(w, 500, "Binary not found: "+vectorBinPath)
		return
	}
	cfgPath := findTomlConfig()
	if _, err := os.Stat(cfgPath); os.IsNotExist(err) {
		jsonError(w, 500, "Config not found: "+cfgPath)
		return
	}
	if pid := findVectorPID(); pid != "" {
		jsonResp(w, map[string]any{"success": true, "pid": pid, "error": "Vector is already running"})
		return
	}

	// data_dir 폴더 자동 생성 (없으면 Vector 시작 실패)
	ensureDataDir(cfgPath)

	cmd := exec.Command(vectorBinPath, "--config", cfgPath)
	cmd.SysProcAttr = windowsHideAttr()

	// Vector 로그를 파일로 저장 (크기 제한)
	vectorLogPath := filepath.Join(configDir, "vector.log")
	logFile, _ := os.OpenFile(vectorLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if logFile != nil {
		lw := &limitedWriter{f: logFile, path: vectorLogPath, maxSize: maxLogSize}
		cmd.Stdout = lw
		cmd.Stderr = lw
	}

	err := cmd.Start()
	if err != nil {
		if logFile != nil {
			logFile.Close()
		}
		jsonError(w, 500, err.Error())
		return
	}
	// 프로세스 종료 시 로그 파일 닫기
	go func() {
		cmd.Wait()
		if logFile != nil {
			logFile.Close()
		}
	}()
	jsonResp(w, map[string]any{"success": true, "pid": cmd.Process.Pid})
}

func handleVectorStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}
	pid := findVectorPID()
	if pid == "" {
		jsonResp(w, map[string]any{"success": true, "error": "Vector is not running"})
		return
	}
	_cmd := exec.Command("taskkill", "/F", "/PID", pid)
	_cmd.SysProcAttr = windowsHideAttr()
	_cmd.Run()
	jsonResp(w, map[string]any{"success": true})
}

func handleVectorRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}
	if pid := findVectorPID(); pid != "" {
		_cmd := exec.Command("taskkill", "/F", "/PID", pid)
		_cmd.SysProcAttr = windowsHideAttr()
		_cmd.Run()
		time.Sleep(1500 * time.Millisecond)
	}
	handleVectorStart(w, r)
}

func handleTestConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}
	cfgPath := findTomlConfig()
	content, err := os.ReadFile(cfgPath)
	if err != nil {
		jsonError(w, 400, "Cannot read config")
		return
	}
	ip, port := tomlGetSinkAddr(string(content))
	if ip == "" {
		jsonError(w, 400, "Cannot parse sink address")
		return
	}

	conn, err := net.DialTimeout("tcp", ip+":"+port, 3*time.Second)
	connected := err == nil
	if connected {
		conn.Close()
	}
	jsonResp(w, map[string]any{
		"connected": connected,
		"host":      ip,
		"port":      port,
		"testedAt":  time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Install ───

func handleServerConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		jsonResp(w, map[string]string{"masterServer": masterServer})
		return
	}
	if r.Method == "POST" || r.Method == "PUT" {
		body := readBody(r)
		if url, ok := body["masterServer"]; ok && url != "" {
			masterServer = strings.TrimRight(url, "/")
			saveConfig()
			log.Printf("[Config] Master server changed to: %s", masterServer)
			jsonResp(w, map[string]any{"success": true, "masterServer": masterServer})
			return
		}
		jsonError(w, 400, "masterServer is required")
		return
	}
}

func handleInstallStatus(w http.ResponseWriter, r *http.Request) {
	cfgPath := findTomlConfig()
	_, binErr := os.Stat(vectorBinPath)
	_, cfgErr := os.Stat(cfgPath)
	jsonResp(w, map[string]any{
		"installed":     binErr == nil && cfgErr == nil,
		"binaryExists":  binErr == nil,
		"configExists":  cfgErr == nil,
		"binaryPath":    vectorBinPath,
		"configPath":    cfgPath,
		"masterServer":  masterServer,
		"edition":       detectEdition(),
	})
}

func handleInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}

	edition := detectEdition()
	param := ""
	if edition != "" {
		param = "?edition=" + edition
	}

	url := masterServer + "/api/monitor/agent-download/vector" + param
	err := downloadAndExtractVector(url)
	if err != nil {
		jsonError(w, 500, err.Error())
		return
	}
	jsonResp(w, map[string]any{"success": true, "message": fmt.Sprintf("Vector가 %s에 설치되었습니다.", configDir)})
}

func detectEdition() string {
	// Win7/Vista 감지
	isWin7 := false
	cmd := exec.Command("cmd", "/c", "ver")
	cmd.SysProcAttr = windowsHideAttr()
	out, err := cmd.Output()
	if err == nil {
		ver := string(out)
		if strings.Contains(ver, "6.1") || strings.Contains(ver, "6.0") {
			isWin7 = true
		}
	}

	if runtime.GOARCH == "386" && isWin7 {
		return "win7-x86"
	}
	if runtime.GOARCH == "386" {
		return "x86"
	}
	if isWin7 {
		return "win7"
	}
	return ""
}

func downloadAndExtractVector(url string) error {
	log.Printf("[Download] GET %s", url)
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("download failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("download failed: HTTP %d — %s", resp.StatusCode, string(body))
	}
	log.Printf("[Download] Response OK, Content-Length: %s", resp.Header.Get("Content-Length"))

	// temp 파일에 저장
	tmpFile, err := os.CreateTemp("", "vector-*.zip")
	if err != nil {
		return fmt.Errorf("temp file create failed: %v", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)
	written, err := io.Copy(tmpFile, resp.Body)
	tmpFile.Close()
	if err != nil {
		return fmt.Errorf("download write failed: %v", err)
	}
	log.Printf("[Download] Saved %d bytes to %s", written, tmpPath)

	// zip 압축 해제 → configDir에 vector.exe + bat 배치
	os.MkdirAll(configDir, 0755)
	zr, err := zip.OpenReader(tmpPath)
	if err != nil {
		return fmt.Errorf("zip open failed: %v", err)
	}
	defer zr.Close()

	extracted := 0
	for _, f := range zr.File {
		name := strings.ReplaceAll(f.Name, "\\", "/")
		if f.FileInfo().IsDir() {
			continue
		}
		// vector.exe (루트 또는 bin/ 안) → configDir/vector.exe
		if name == "vector.exe" || name == "bin/vector.exe" {
			dest := filepath.Join(configDir, "vector.exe")
			if e := extractFile(f, dest); e != nil {
				log.Printf("[Download] Extract error %s: %v", name, e)
			} else {
				log.Printf("[Download] Extracted %s → %s (%d bytes)", name, dest, f.UncompressedSize64)
				extracted++
			}
		}
		// *.bat → configDir
		if !strings.Contains(name, "/") && strings.HasSuffix(name, ".bat") {
			dest := filepath.Join(configDir, filepath.Base(name))
			if e := extractFile(f, dest); e != nil {
				log.Printf("[Download] Extract error %s: %v", name, e)
			} else {
				log.Printf("[Download] Extracted %s → %s", name, dest)
				extracted++
			}
		}
	}
	log.Printf("[Download] Extraction complete: %d files to %s", extracted, configDir)

	if extracted == 0 {
		// zip 내용물 디버깅
		var names []string
		for _, f := range zr.File {
			names = append(names, f.Name)
		}
		log.Printf("[Download] WARNING: No files extracted! Zip contents: %v", names)
	}

	// data 디렉토리 생성
	os.MkdirAll(filepath.Join(configDir, "data"), 0755)
	return nil
}

func extractFile(f *zip.File, dest string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, rc)
	return err
}

// ─── Update ───

func handleUpdateCheck(w http.ResponseWriter, r *http.Request) {
	edition := detectEdition()
	param := ""
	if edition != "" {
		param = "?edition=" + edition
	}

	var localVer, serverVer string

	// 로컬 버전
	if _, err := os.Stat(vectorBinPath); err == nil {
		_cmd := exec.Command(vectorBinPath, "--version")
		_cmd.SysProcAttr = windowsHideAttr()
		out, err := _cmd.Output()
		if err == nil {
			localVer = strings.TrimSpace(string(out))
		}
	}

	// 서버 버전
	resp, err := httpGet(masterServer + "/api/monitor/agent-download/version" + param)
	if err == nil {
		defer resp.Body.Close()
		var data map[string]string
		json.NewDecoder(resp.Body).Decode(&data)
		serverVer = data["version"]
	}

	jsonResp(w, map[string]any{
		"localVersion":    localVer,
		"serverVersion":   serverVer,
		"updateAvailable": localVer != "" && serverVer != "" && localVer != serverVer,
		"edition":         edition,
	})
}

func handleUpdateExecute(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}

	// Vector 중지
	if pid := findVectorPID(); pid != "" {
		_cmd := exec.Command("taskkill", "/F", "/PID", pid)
		_cmd.SysProcAttr = windowsHideAttr()
		_cmd.Run()
		time.Sleep(2 * time.Second)
	}

	// 백업
	backupPath := vectorBinPath + ".old"
	if _, err := os.Stat(vectorBinPath); err == nil {
		os.Remove(backupPath)
		os.Rename(vectorBinPath, backupPath)
	}

	// 다운로드 + 추출
	edition := detectEdition()
	param := ""
	if edition != "" {
		param = "?edition=" + edition
	}
	err := downloadAndExtractVector(masterServer + "/api/monitor/agent-download/vector" + param)
	if err != nil {
		// 복원
		if _, e := os.Stat(backupPath); e == nil {
			os.Rename(backupPath, vectorBinPath)
		}
		jsonError(w, 500, err.Error())
		return
	}

	jsonResp(w, map[string]any{"success": true, "message": "업데이트 완료. Vector를 시작하세요."})
}

// ─── Service ───

func handleServiceStatus(w http.ResponseWriter, r *http.Request) {
	jsonResp(w, map[string]any{
		"vector":  map[string]string{"name": "VectorAgent", "state": getServiceState("VectorAgent")},
		"manager": map[string]string{"name": "VectorAgentManager", "state": getServiceState("VectorAgentManager")},
	})
}

func handleServiceInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}
	body := readBody(r)
	target := body["target"]
	if target == "" {
		target = "both"
	}
	results := map[string]any{}

	if target == "vector" || target == "both" {
		binPath := fmt.Sprintf(`%s --config %s`, vectorBinPath, findTomlConfig())
		results["vector"] = installService("VectorAgent", binPath)
	}
	if target == "manager" || target == "both" {
		exePath, _ := os.Executable()
		results["manager"] = installService("VectorAgentManager", exePath+" --no-tray")
	}
	jsonResp(w, results)
}

func handleServiceUninstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}
	body := readBody(r)
	target := body["target"]
	if target == "" {
		target = "both"
	}
	results := map[string]any{}

	if target == "vector" || target == "both" {
		results["vector"] = uninstallService("VectorAgent")
	}
	if target == "manager" || target == "both" {
		results["manager"] = uninstallService("VectorAgentManager")
	}
	jsonResp(w, results)
}

func svcStateLabel(state string) string {
	switch state {
	case "RUNNING":
		return "Running ✓"
	case "STOPPED":
		return "Stopped"
	case "NOT_INSTALLED":
		return "Not registered (click to register)"
	default:
		return state
	}
}

func toggleService(name, binPath string) {
	state := getServiceState(name)
	if state == "NOT_INSTALLED" {
		result := installService(name, binPath)
		if result["success"] == true {
			log.Printf("[Service] %s registered OK", name)
		} else {
			log.Printf("[Service] %s register FAILED: %v (admin required?)", name, result["error"])
		}
	} else {
		result := uninstallService(name)
		if result["success"] == true {
			log.Printf("[Service] %s unregistered OK", name)
		} else {
			log.Printf("[Service] %s unregister FAILED: %v", name, result["error"])
		}
	}
}

func getServiceState(name string) string {
	_cmd := exec.Command("sc", "query", name)
	_cmd.SysProcAttr = windowsHideAttr()
	out, err := _cmd.Output()
	if err != nil {
		return "NOT_INSTALLED"
	}
	s := string(out)
	if strings.Contains(s, "RUNNING") {
		return "RUNNING"
	}
	if strings.Contains(s, "STOPPED") {
		return "STOPPED"
	}
	return "UNKNOWN"
}

func installService(name, binPath string) map[string]any {
	_cmd := exec.Command("sc", "create", name, "binPath=", binPath, "start=", "auto")
	_cmd.SysProcAttr = windowsHideAttr()
	err := _cmd.Run()
	if err != nil {
		return map[string]any{"success": false, "error": err.Error()}
	}
	return map[string]any{"success": true}
}

func uninstallService(name string) map[string]any {
	_cmd := exec.Command("sc", "stop", name)
	_cmd.SysProcAttr = windowsHideAttr()
	_cmd.Run()
	_cmd = exec.Command("sc", "delete", name)
	_cmd.SysProcAttr = windowsHideAttr()
	err := _cmd.Run()
	if err != nil {
		return map[string]any{"success": false, "error": err.Error()}
	}
	return map[string]any{"success": true}
}

// ─── TOML 목록/다운로드 ───

func handleTomlList(w http.ResponseWriter, r *http.Request) {
	resp, err := httpGet(masterServer + "/api/monitor/agent/configs")
	if err != nil {
		jsonError(w, 502, "Cannot reach master server")
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}

func handleTomlDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		return
	}
	body := readBody(r)
	name := body["name"]
	if name == "" {
		jsonError(w, 400, "name is required")
		return
	}

	resp, err := httpGet(masterServer + "/api/monitor/download/agent/" + name)
	if err != nil {
		jsonError(w, 502, "Download failed")
		return
	}
	defer resp.Body.Close()
	content, _ := io.ReadAll(resp.Body)

	os.MkdirAll(configDir, 0755)
	tomlPath := filepath.Join(configDir, name+".toml")
	os.WriteFile(tomlPath, content, 0644)
	// TOML 저장 후 data_dir 폴더 자동 생성
	ensureDataDir(tomlPath)
	jsonResp(w, map[string]any{"success": true, "message": fmt.Sprintf("%s.toml saved to %s", name, configDir)})
}

// ─── Logs ───

func handleVectorLog(w http.ResponseWriter, r *http.Request) {
	vectorLogPath := filepath.Join(configDir, "vector.log")
	data, err := os.ReadFile(vectorLogPath)
	if err != nil {
		jsonResp(w, map[string]any{"log": ""})
		return
	}
	// 마지막 100줄만
	lines := strings.Split(string(data), "\n")
	if len(lines) > 100 {
		lines = lines[len(lines)-100:]
	}
	jsonResp(w, map[string]any{"log": strings.Join(lines, "\n")})
}

func handleLogsRecent(w http.ResponseWriter, r *http.Request) {
	// TOML에서 include 경로 추출 + 폴더 존재 여부 체크
	type watchInfo struct {
		Path   string `json:"path"`
		Exists bool   `json:"exists"`
	}
	var watchPaths []watchInfo
	var globPatterns []string
	cfgPath := findTomlConfig()
	content, err := os.ReadFile(cfgPath)
	if err == nil {
		raw := tomlGetInclude(string(content))
		for _, p := range strings.Split(raw, "\n") {
			p = strings.TrimSpace(p)
			if p != "" {
				dir := filepath.Dir(p)
				_, dirErr := os.Stat(dir)
				watchPaths = append(watchPaths, watchInfo{Path: p, Exists: dirErr == nil})
				globPatterns = append(globPatterns, p)
			}
		}
	}

	// include 경로에서 최근 수정된 파일 목록
	var files []map[string]any
	for _, pattern := range globPatterns {
		matches, _ := filepath.Glob(pattern)
		for _, m := range matches {
			info, err := os.Stat(m)
			if err != nil || info.IsDir() {
				continue
			}
			files = append(files, map[string]any{
				"name":    info.Name(),
				"dir":     filepath.Dir(m),
				"modTime": info.ModTime().Format("2006-01-02 15:04:05"),
				"size":    info.Size(),
			})
		}
	}

	// 최근 수정순 정렬 (최대 20개)
	if len(files) > 1 {
		for i := 0; i < len(files)-1; i++ {
			for j := i + 1; j < len(files); j++ {
				if files[j]["modTime"].(string) > files[i]["modTime"].(string) {
					files[i], files[j] = files[j], files[i]
				}
			}
		}
	}
	if len(files) > 20 {
		files = files[:20]
	}

	jsonResp(w, map[string]any{"files": files, "watchPaths": watchPaths})
}

// ─── HTTP 유틸 ───

// ensureDataDir — TOML에서 data_dir을 읽어 폴더가 없으면 자동 생성
func ensureDataDir(tomlPath string) {
	content, err := os.ReadFile(tomlPath)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "data_dir") {
			// data_dir = 'C:\vector-data-xxx' 또는 "C:\\vector-data-xxx"
			val := trimmed[strings.Index(trimmed, "=")+1:]
			val = strings.TrimSpace(val)
			val = strings.Trim(val, `"'`)
			val = strings.ReplaceAll(val, `\\`, `\`)
			if val != "" {
				os.MkdirAll(val, 0755)
			}
			break
		}
	}
}

func startHeartbeat() {
	for {
		time.Sleep(30 * time.Second)
		sendHeartbeat()
	}
}

func sendHeartbeat() {
	cfgPath := findTomlConfig()
	content, err := os.ReadFile(cfgPath)
	if err != nil {
		return
	}
	s := string(content)
	eqType := tomlGetMeta(s, "equipment_type")
	eqId := tomlGetMeta(s, "equipment_id")
	lineCode := tomlGetMeta(s, "line_code")
	logType := tomlGetMeta(s, "log_type")
	if eqId == "" {
		return
	}

	pid := findVectorPID()
	running := pid != ""

	payload := map[string]any{
		"equipment_id": eqId,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
		"metadata": map[string]any{
			"equipment_type": eqType,
			"line_code":      lineCode,
			"log_type":       logType,
			"vector_running": running,
			"pid":            pid,
		},
	}
	data, _ := json.Marshal(payload)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(masterServer+"/api/heartbeat", "application/json", strings.NewReader(string(data)))
	if err != nil {
		return
	}
	resp.Body.Close()
}

func httpGet(url string) (*http.Response, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	return client.Get(url)
}

// ─── Windows 유틸 ───
// windowsHideAttr는 windows_attr.go에서 구현

