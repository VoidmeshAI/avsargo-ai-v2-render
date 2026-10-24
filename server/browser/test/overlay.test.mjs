import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspectView,capturePlan} from '../view.mjs';
function inspect(position='static',{hidden=false,tagName='BUTTON',height=320}={}){
 const rect={x:0,y:380,top:380,bottom:380+height,width:1040,height};
 const root={scrollWidth:1040,clientWidth:1040,scrollHeight:1500,clientHeight:700};
 const panel={parentElement:root,position,getBoundingClientRect:()=>rect};
 const node={tagName,parentElement:panel,getBoundingClientRect:()=>({...rect,width:100,height:40}),getAttribute:()=>null};
 const body={scrollWidth:1040,clientWidth:1040,scrollHeight:1500,clientHeight:700};
 const document={documentElement:root,body,title:'Test form',activeElement:null,addEventListener(){},querySelectorAll:()=>[node]};
 const window={scrollX:0,scrollY:0,innerHeight:700};
 const context={document,window,MutationObserver:class{observe(){}},getComputedStyle:item=>({position:item.position||'static',visibility:hidden?'hidden':'visible'})};
 return vm.runInNewContext('('+inspectView.toString()+')()',context);
}
test('a fixed cookie panel with no dialog role uses viewport coordinates',()=>{
 const view=inspect('fixed');assert.equal(view.viewportOnly,true);assert.equal(capturePlan(view,{width:1040,height:700},true).mode,'viewport');
});
test('sticky navigation cannot move away from a full-page click',()=>{assert.equal(inspect('sticky',{height:70}).viewportOnly,true);});
test('ordinary long forms keep native document scrolling; hidden panels do not disable it',()=>{
 for(const view of [inspect(),inspect('fixed',{hidden:true})]){assert.equal(view.viewportOnly,false);assert.equal(capturePlan(view,{width:1040,height:700},true).mode,'document');}
});
