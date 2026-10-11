#!/usr/bin/env python3
"""Build using SDK 35 and a SHA256-pinned Gradle distribution. No embedded API key or publish action."""
from pathlib import Path
import hashlib,os,shutil,subprocess,sys,urllib.request,zipfile
ROOT=Path(__file__).resolve().parents[1]
GRADLE_VERSION='8.10.2'
GRADLE_SHA='31c55713e40233a8303827ceb42ca48a47267a0ad4bab9177123121e71524c26'
def main():
    sdk=os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not sdk:
        local=ROOT/'local.properties'
        if local.exists():
            for line in local.read_text().splitlines():
                if line.startswith('sdk.dir='): sdk=line.split('=',1)[1].replace('\\\\','\\').replace('\\:',':')
    if not sdk or not (Path(sdk)/'platforms/android-35/android.jar').is_file():
        print('BLOCKED: Android SDK platform 35 is missing. Install it with Android Studio SDK Manager or sdkmanager; then set ANDROID_HOME.',file=sys.stderr)
        return 21
    if not shutil.which('java'):
        print('BLOCKED: JDK 17 is required.',file=sys.stderr);return 22
    gradle=ROOT/'.build-tools'/f'gradle-{GRADLE_VERSION}'/'bin'/('gradle.bat' if os.name=='nt' else 'gradle')
    if not gradle.exists():
        archive=ROOT/'.build-tools'/'gradle.zip';archive.parent.mkdir(exist_ok=True)
        try:
            digest=hashlib.sha256();request=urllib.request.Request(f'https://services.gradle.org/distributions/gradle-{GRADLE_VERSION}-bin.zip',headers={'User-Agent':'AvsarGo-Android-Build/12'})
            with urllib.request.urlopen(request,timeout=30) as response,archive.open('wb') as output:
                while block:=response.read(1024*1024):digest.update(block);output.write(block)
            if digest.hexdigest()!=GRADLE_SHA: raise RuntimeError('Gradle SHA-256 mismatch')
            with zipfile.ZipFile(archive) as z:
                for item in z.infolist():
                    if Path(item.filename).is_absolute() or '..' in Path(item.filename).parts: raise RuntimeError('Unsafe distribution archive')
                z.extractall(archive.parent)
            if os.name!='nt':gradle.chmod(0o755)
        finally:archive.unlink(missing_ok=True)
    env=os.environ.copy();env['ANDROID_HOME']=str(sdk)
    command=[str(gradle),'--no-daemon',':app:lintDebug',':app:assembleDebug']
    subprocess.run(command,cwd=ROOT,env=env,check=True,shell=False)
    apk=ROOT/'app/build/outputs/apk/debug/app-debug.apk'
    if not apk.exists():raise RuntimeError('Gradle returned without an APK')
    output=ROOT/'AvsarGo_AI_V13_Android_Test.apk';shutil.copy2(apk,output)
    print('APK created:',output);print('SHA-256:',hashlib.sha256(output.read_bytes()).hexdigest())
    return 0
if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:print('BUILD FAILED:',str(exc),file=sys.stderr);sys.exit(1)
