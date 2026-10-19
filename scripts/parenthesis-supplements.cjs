// Outermost pairs keep nested supplements inside one span.
function pairs(text) {
  const result=[]; let depth=0,start=0;
  for (let i=0;i<text.length;i++) {
    if (text[i]==='(' && depth++===0) start=i;
    if (text[i]===')' && depth>0 && --depth===0) result.push({start,end:i+1});
  }
  return result;
}

function scan(tokens) {
  const result=[]; let slide=0,titlePage=false,heading=false,margin=false;
  for (const token of tokens) {
    if (token.type==='marpit_slide_open') { slide++; titlePage=/(?:^|\s)(?:first-slide|paper-title|title-slide-big|lead|takahashi)(?:\s|$)/.test(token.attrGet('class')||''); }
    if (token.type==='heading_open') heading=['h1','h2'].includes(token.tag);
    if (token.type==='heading_close') heading=false;
    if (['header','footer'].includes(token.tag)) margin=token.nesting===1;
    const scope=titlePage?'title-page':heading?'slide-title':margin?'header/footer':null;
    if (['fence','code_block','marp_math_block'].includes(token.type)) {
      for (const pair of pairs(token.content)) result.push({slide,text:token.content.slice(pair.start,pair.end),reason:token.type==='marp_math_block'?'math':'code'});
    }
    if (token.type!=='inline') continue;
    const chars=[]; let linkReason=null;
    const children=token.children||[];
    children.forEach((child,index)=>{
      if (child.type==='link_open') {
        const end=children.findIndex((t,i)=>i>index&&t.type==='link_close');
        const label=children.slice(index+1,end).map(t=>t.content).join('');
        linkReason=/\+.*[’']\d{2}/.test(label)?'citation-link':null;
        // URL attributes never enter the rendered text stream.
        for (const pair of pairs(child.attrGet('href')||'')) result.push({slide,text:child.attrGet('href').slice(pair.start,pair.end),reason:'link-url'});
      }
      if (child.type==='link_close') linkReason=null;
      if (!['text','code_inline','marp_math_inline'].includes(child.type)) return;
      const content=child.content,reason=scope||(['code_inline','marp_math_inline'].includes(child.type)?child.type==='code_inline'?'code':'math':linkReason);
      const urls=[...content.matchAll(/(?:[a-z][a-z\d+.-]*:\/\/|www\.)\S+/gi)];
      for (let offset=0;offset<content.length;offset++) chars.push({char:content[offset],child,offset,reason:reason|| (urls.some(u=>offset>=u.index&&offset<u.index+u[0].length)?'url':null)});
    });
    const text=chars.map(c=>c.char).join('');
    for (const pair of pairs(text)) {
      const run=chars.slice(pair.start,pair.end),meaningful=run.filter(c=>!/[()\s]/.test(c.char));
      const excluded=meaningful.length&&meaningful.every(c=>c.reason&&c.reason===meaningful[0].reason)?meaningful[0].reason:null;
      const first=run[0],last=run.at(-1),cross=run.some(c=>c.child!==first.child||c.reason);
      result.push({slide,text:text.slice(pair.start,pair.end),reason:scope||excluded||(cross?'cross-inline':null),child:first.child,start:first.offset,end:last.offset+1});
    }
  }
  return result;
}

module.exports = function parenthesisSupplements(md) {
  md.core.ruler.after('marpit_directives_apply','parenthesis-supplements',state=>{
    const runs=scan(state.tokens),byToken=new Map();
    for (const run of runs.filter(r=>!r.reason)) {
      if (!byToken.has(run.child)) byToken.set(run.child,[]);
      byToken.get(run.child).push(run);
    }
    for (const token of state.tokens.filter(t=>t.type==='inline')) token.children=token.children.flatMap(child=>{
      if (!byToken.has(child)) return [child];
      const result=[]; let start=0;
      const text=content=>{if(content){const t=new state.Token('text','',0);t.content=content;result.push(t);}};
      for (const run of byToken.get(child)) {
        text(child.content.slice(start,run.start));
        const open=new state.Token('paren_open','span',1);open.attrSet('class','paren');result.push(open);
        text(child.content.slice(run.start,run.end));result.push(new state.Token('paren_close','span',-1));start=run.end;
      }
      text(child.content.slice(start));return result;
    });
  });
};
module.exports.scan=scan;
