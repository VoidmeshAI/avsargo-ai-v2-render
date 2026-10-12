import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.TYPESCRIPT_PATH||'typescript');
if(ts.version!=='5.8.3')throw Error('Use the pinned TypeScript 5.8.3 compiler');
for(const name of ['app','form-agent']){
 const source=await readFile(new URL('../ui/'+name+'.source.js',import.meta.url),'utf8');
 const result=ts.transpileModule(source,{fileName:name+'.js',reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2018,module:ts.ModuleKind.None,removeComments:false,newLine:ts.NewLineKind.LineFeed}});
 if(result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('Invalid customer source: '+name);
 const output='/* Generated from ui/'+name+'.source.js for older Android WebViews. */\n'+result.outputText;
 const file=new URL('../app/src/main/assets/app/'+name+'.js',import.meta.url);
 if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==output)throw Error('Regenerate customer asset: '+name);}else await writeFile(file,output);
}
console.log('Customer assets: deterministic ES2018 output verified');
