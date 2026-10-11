import {mkdirSync,chownSync,existsSync} from 'node:fs';
const directory=process.env.DATA_DIR||'/data';
if(process.getuid?.()===0){mkdirSync(directory,{recursive:true,mode:0o700});chownSync(directory,1000,1000);for(const name of ['avsargo-control.db','avsargo-control.db-shm','avsargo-control.db-wal']){const path=directory+'/'+name;if(existsSync(path))chownSync(path,1000,1000);}process.setgid(1000);process.setuid(1000);}
await import('./index.mjs');
