@echo off
pushd I:\自动化执行\void-main
set ELECTRON_RUN_AS_NODE=
set NODE_ENV=development
set VSCODE_DEV=1
set VSCODE_CLI=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1
".build\electron\Void.exe" . --remote-debugging-port=9222 --user-data-dir ./.tmp/user-data-dev --extensions-dir ./.tmp/extensions > .tmp\void-stdout.log 2> .tmp\void-stderr.log
echo %errorlevel% > .tmp\void-exitcode.txt
popd
