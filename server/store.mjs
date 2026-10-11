import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export function sqliteStore(path,key){
  const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=10000; CREATE TABLE IF NOT EXISTS control_state (id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL)');
  const read=db.prepare('SELECT payload FROM control_state WHERE id=1'),insert=db.prepare('INSERT OR IGNORE INTO control_state(id,payload) VALUES(1,?)'),update=db.prepare('UPDATE control_state SET payload=? WHERE id=1');
  return {
    async read(){const row=read.get();return row?unseal(row.payload,key):null;},
    async write(value){insert.run(seal(value,key));},
    async transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=unseal(read.get().payload,key),result=fn(value);if(result&&typeof result.then==='function')throw new Error('SQLite mutations must be synchronous');update.run(seal(value,key));db.exec('COMMIT');return {state:value,result};}catch(error){db.exec('ROLLBACK');throw error;}},
    async close(){db.close();}
  };
}

export function seal(value,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
export function unseal(value,key){
  const bytes=Buffer.from(value,'base64');
  if(bytes.length<29)throw new Error('Invalid encrypted state');
  const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));
}
export async function postgresStore(url,key){
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:15000});
  await pool.query('CREATE TABLE IF NOT EXISTS avsargo_control_state (id integer PRIMARY KEY CHECK (id=1), payload text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  return {
    async read(){const result=await pool.query('SELECT payload FROM avsargo_control_state WHERE id=1');return result.rows[0]?unseal(result.rows[0].payload,key):null;},
    async write(value){await pool.query('INSERT INTO avsargo_control_state(id,payload) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',[seal(value,key)]);},
    async transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');const row=await client.query('SELECT payload FROM avsargo_control_state WHERE id=1 FOR UPDATE');const value=unseal(row.rows[0].payload,key),result=await fn(value);await client.query('UPDATE avsargo_control_state SET payload=$1,updated_at=now() WHERE id=1',[seal(value,key)]);await client.query('COMMIT');return {state:value,result};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}},
    async close(){await pool.end();}
  };
}
