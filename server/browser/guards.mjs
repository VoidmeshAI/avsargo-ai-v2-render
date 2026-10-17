import {isIP} from 'node:net';
import {lookup} from 'node:dns/promises';
export const operators=['proteantech.in','utiitsl.com','ibps.in','nta.ac.in'];
export function official(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(/\.(gov\.in|nic\.in)$/i.test(u.hostname)||operators.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)));}catch{return false;}}
export function publicIP(value){
 if(value.startsWith('::ffff:'))return publicIP(value.slice(7));
 if(isIP(value)===6)return /^[23][a-f0-9]{3}:/i.test(value)&&!/^2001:db8:/i.test(value);
 if(isIP(value)!==4)return false;
 const [a,b]=value.split('.').map(Number);return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a>=224);
}
const cache=new Map();
export async function publicResource(value,resolver=lookup){
 let u;try{u=new URL(value);}catch{return false;}
 if(u.protocol==='data:'||u.protocol==='blob:')return true;
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return false;
 const host=u.hostname.replace(/^\[|\]$/g,'');if(isIP(host))return publicIP(host);
 if(!host.includes('.')||/\.(?:internal|local|localhost|test|invalid)$/.test(host))return false;
 const prior=cache.get(host);if(resolver===lookup&&prior&&Date.now()-prior.at<30000)return prior.ok;
 try{const records=await resolver(host,{all:true});const ok=records.length>0&&records.every(r=>publicIP(r.address));if(resolver===lookup){if(cache.size>2000)cache.clear();cache.set(host,{at:Date.now(),ok});}return ok;}catch{return false;}
}
export function cleanProfile(fields={},meta={}){
 const out={},labels={};if(!fields||typeof fields!=='object'||Array.isArray(fields))return {fields:out,meta:labels};
 for(const [key,value]of Object.entries(fields).slice(0,120)){if(!/^[a-zA-Z][a-zA-Z0-9_]{0,50}$/.test(key)||/password|secret|token|otp|captcha|cvv|card|pin$/i.test(key))continue;if(typeof value!=='string'||value.length>700||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))continue;out[key]=value;if(/^extra_[a-f0-9]{16}$/.test(key)&&typeof meta[key]?.label==='string'&&!/password|otp|captcha|cvv|payment|secret/i.test(meta[key].label))labels[key]={label:meta[key].label.slice(0,100)};}
 if(/^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/.test(out.dob||'')){const [day,month,year]=out.dob.split(/[/.\-]/);Object.assign(out,{dobDay:day.padStart(2,'0'),dobMonth:month.padStart(2,'0'),dobYear:year});}
 return {fields:out,meta:labels};
}
export function docKind(label){label=String(label).replace(/passport[\s-]*size/ig,'');const types=[['aadhaar',/aadhaar|aadhar|आधार/i],['pan',/\bpan\b|पैन/i],['photo',/photo|फोटो/i],['signature',/signature|हस्ताक्षर/i],['marksheet',/marksheet|mark.?sheet/i],['qualification',/qualification|degree/i],['caste',/caste|जाति/i],['income',/income|आय/i],['domicile',/domicile|residence/i],['bank',/bank|passbook/i],['business',/business|enterprise|udyam/i],['passport',/passport/i]];const matches=types.filter(([,rule])=>rule.test(label));return matches.length===1?matches[0][0]:'';}
export function fileMatches(file,upload,documents,uploads){const kind=docKind(upload.label);if(!kind||file.type!==kind||documents.filter(d=>d.type===kind).length!==1||uploads.filter(u=>docKind(u.label)===kind).length!==1)return false;return !upload.accept||upload.accept.split(',').some(a=>{a=a.trim().toLowerCase();return a===file.mime||a==='image/*'&&file.mime.startsWith('image/')||a.startsWith('.')&&file.name.toLowerCase().endsWith(a);});}
