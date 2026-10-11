import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sqliteStore} from '../store.mjs';

test('persistent SQLite state survives restart and stores only encrypted payloads',async()=>{const directory=await mkdtemp(join(tmpdir(),'avsargo-control-')),path=join(directory,'test.db'),key=randomBytes(32);let store=sqliteStore(path,key);try{await store.write({admin:'secret_owner_password_hash',config:{apiKey:'private_provider_key'}});await store.transaction(value=>{value.counter=1;});await store.close();store=sqliteStore(path,key);assert.equal((await store.read()).config.apiKey,'private_provider_key');assert.equal((await store.read()).counter,1);const bytes=await readFile(path);assert.ok(!bytes.includes(Buffer.from('private_provider_key')));assert.ok(!bytes.includes(Buffer.from('secret_owner_password_hash')));}finally{await store.close();await rm(directory,{recursive:true,force:true});}});
test('failed SQLite mutation rolls back and wrong encryption keys fail closed',async()=>{const directory=await mkdtemp(join(tmpdir(),'avsargo-control-')),path=join(directory,'test.db'),key=randomBytes(32),store=sqliteStore(path,key);try{await store.write({counter:1});await assert.rejects(()=>store.transaction(value=>{value.counter=2;throw Error('validation');}));assert.equal((await store.read()).counter,1);const wrong=sqliteStore(path,randomBytes(32));try{await assert.rejects(()=>wrong.read());}finally{await wrong.close();}}finally{await store.close();await rm(directory,{recursive:true,force:true});}});
