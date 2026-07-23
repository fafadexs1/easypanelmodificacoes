@echo off
setlocal EnableExtensions

REM ================================================================
REM Launcher for the official Supabase PG15 -> PG17 upgrade script.
REM The actual migration runs on the Easypanel Linux server via SSH.
REM ================================================================

set "SSH_HOST=193.202.85.69"
set "SSH_PORT=22"
set "SSH_USER=root"
set "COMPOSE_PROJECT=dialogy_supabase"
set "REMOTE_DIR=/etc/easypanel/projects/dialogy/supabase/code/supabase/code"
set "COMPOSE_OVERRIDE_FILE=docker-compose.override.yml"

echo ================================================================
echo Supabase PostgreSQL 15 para PostgreSQL 17
echo ================================================================
echo.
echo Antes de continuar, confirme que:
echo   1. O deploy com PostgreSQL 15 esta saudavel.
echo   2. O dump do banco e o backup do Storage estao fora do servidor.
echo   3. Existe espaco livre de pelo menos 2x o banco mais 5 GB.
echo   4. O arquivo .env completo existe no diretorio remoto.
echo   5. Nenhuma extensao incompativel precisa ser preservada.
echo.
echo A migracao causa indisponibilidade e nao deve ser interrompida.
echo.

set /p "CONFIRM=Digite MIGRAR-PG17 para continuar: "
if /I not "%CONFIRM%"=="MIGRAR-PG17" (
    echo Operacao cancelada.
    pause
    exit /b 1
)

echo.
echo Verificando arquivos e estado do servidor...

ssh -t -p "%SSH_PORT%" "%SSH_USER%@%SSH_HOST%" ^
  "cd '%REMOTE_DIR%' || exit 10; test -f .env || { echo 'ERRO: arquivo .env remoto nao encontrado.'; exit 11; }; test -f docker-compose.yml || exit 12; test -f docker-compose.pg17.yml || exit 13; test -f '%COMPOSE_OVERRIDE_FILE%' || exit 14; env COMPOSE_PROJECT='%COMPOSE_PROJECT%' COMPOSE_OVERRIDE_FILE='%COMPOSE_OVERRIDE_FILE%' bash utils/upgrade-pg17.sh"

set "UPGRADE_RESULT=%ERRORLEVEL%"

echo.
if not "%UPGRADE_RESULT%"=="0" (
    echo ================================================================
    echo A migracao terminou com erro: %UPGRADE_RESULT%
    echo ================================================================
    echo Nao apague volumes, data.bak.pg15 ou arquivos de migracao.
    echo Consulte a mensagem exibida pelo script antes de tentar novamente.
    pause
    exit /b %UPGRADE_RESULT%
)

echo ================================================================
echo Migracao concluida pelo script oficial.
echo ================================================================
echo.
echo Valide o PostgreSQL, Auth, REST, Realtime e Storage antes de
echo remover volumes ou o backup data.bak.pg15.
echo.
echo IMPORTANTE: antes do proximo deploy do Easypanel, altere a imagem
echo do servico db no docker-compose.yml para supabase/postgres:17.6.1.136,
echo faca commit e push. O Easypanel nao inclui automaticamente o override
echo docker-compose.pg17.yml nos deploys normais.
echo.
pause
exit /b 0
