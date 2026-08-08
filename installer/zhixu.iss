#ifndef MyAppVersion
  #define MyAppVersion "0.1.4"
#endif

#define MyAppName "知序"
#define MyAppExeName "zhixu.exe"

[Setup]
AppId={{44679C29-4CD4-4AAA-8FB9-AA3568109D13}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=GalaxyWK
AppPublisherURL=https://github.com/galaxywk223/zhixu
AppSupportURL=https://github.com/galaxywk223/zhixu/issues
AppUpdatesURL=https://github.com/galaxywk223/zhixu/releases
DefaultDirName={localappdata}\Programs\Zhixu
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=Zhixu-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\windows\runner\resources\app_icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加快捷方式："; Flags: unchecked

[Files]
Source: "..\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent
