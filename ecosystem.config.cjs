/**
 * @file ecosystem.config.cjs
 * @description PM2 프로세스 관리 설정 — 백엔드(Fastify) + 프론트엔드(Next.js) 동시 실행
 *
 * 초보자 가이드:
 * 1. `pm2 start ecosystem.config.cjs` — 전체 서비스 시작
 * 2. `pm2 restart all` — 전체 재시작
 * 3. `pm2 logs` — 실시간 로그 확인
 * 4. `pm2 status` — 프로세스 상태 확인
 * 5. `pm2 stop all` — 전체 중지
 */
module.exports = {
  apps: [
    {
      name: 'vector-backend',
      script: 'dist/index.js',
      cwd: __dirname,
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 3110,
        HOST: '0.0.0.0',
      },
      instances: 1,
      exec_mode: 'fork',
      windowsHide: true,
      watch: false,
      max_memory_restart: '3000M',
      // PM2가 SIGTERM 후 SIGKILL까지 대기 시간 (default 1600ms — 너무 짧음).
      // backend의 graceful shutdown 중 stopVector가 최대 30s 대기하므로 60s 확보.
      // 종료 직전 Vector buffer flush가 완료되어야 disk buffer corruption 방지.
      kill_timeout: 60000,
      error_file: 'logs/backend-error.log',
      out_file: 'logs/backend-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'vector-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3100',
      cwd: __dirname + '/frontend',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
      },
      instances: 1,
      exec_mode: 'fork',
      windowsHide: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '../logs/frontend-error.log',
      out_file: '../logs/frontend-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
