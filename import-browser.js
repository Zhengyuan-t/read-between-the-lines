'use strict';
// XLSX is a ZIP container of XML documents. No requests leave the browser.
window.ReaderImport = (() => {
 const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const fail = message => { throw new Error(message); };
 const nodes=(el,name)=>[...el.getElementsByTagNameNS('*',name)];
 const text=(el,name)=>nodes(el,name)[0]?.textContent||'';
 function parseXML(source){if(/<!DOCTYPE|<!ENTITY/i.test(source))fail('文件包含不支持的 XML 声明。请重新保存为 .xlsx。');const d=new DOMParser().parseFromString(source,'application/xml');if(d.getElementsByTagName('parsererror').length)fail('工作簿 XML 损坏，请重新保存。');return d;}
 function guardZIP(bytes){
  const v=new DataView(bytes);let end=-1;
  for(let i=v.byteLength-22;i>=Math.max(0,v.byteLength-65557);i--){if(v.getUint32(i,true)===0x06054b50){end=i;break;}}
  if(end<0)fail('这不是有效的 .xlsx 文件。旧 .xls 或加密文件请先另存为 .xlsx。');
  const count=v.getUint16(end+10,true),offset=v.getUint32(end+16,true);
  if(count>5000||v.getUint16(end+4,true)||v.getUint16(end+6,true))fail('工作簿过大或使用了不支持的 ZIP 格式。');
  let p=offset,total=0;
  for(let i=0;i<count;i++){
   if(p+46>v.byteLength||v.getUint32(p,true)!==0x02014b50)fail('工作簿 ZIP 结构损坏。');
   if(v.getUint16(p+8,true)&1)fail('请解除工作簿密码后再导入。');
   total+=v.getUint32(p+24,true);if(total>40*1024*1024)fail('解压后的表格超过 40 MB，请精简文件。');
   p+=46+v.getUint16(p+28,true)+v.getUint16(p+30,true)+v.getUint16(p+32,true);
  }
 }
 function toArticle(rows,title){
  const entries=[],warnings=[];let first=true,paragraph=0,last=0;
  for(const [rowNo,cells] of rows){
   const sentence=String(cells[0]??'').trim(),analysis=String(cells[1]??'').trim();
   if(entries.length&&rowNo>last+1)paragraph++;last=rowNo;
   if(!sentence&&!analysis){if(entries.length)paragraph++;continue;}
   if(first){first=false;if(['句子','英文句子','sentence','sentences','原句'].includes(sentence.toLowerCase())&&['解析','句子解析','句子的解析','语法解析','analysis','解析与翻译'].includes(analysis.toLowerCase()))continue;}
   if(!sentence)fail(`第 ${rowNo} 行的第一列没有句子，但第二列有解析。`);
   if(sentence.length>15000||analysis.length>32767)fail(`第 ${rowNo} 行内容过长，请每行只放一个句子。`);
   if(!analysis)warnings.push(`第 ${rowNo} 行缺少解析，已保留句子。`);
   if(Object.keys(cells).some(k=>Number(k)>1&&cells[k]))warnings.push(`第 ${rowNo} 行第三列之后的内容未导入，请将翻译和解析放在第二列。`);
   entries.push({sentence,analysis,paragraph,sourceRow:rowNo});if(entries.length>5000)fail('每张工作表最多支持 5,000 句，请拆分。');
  }
  return entries.length?{title,entries,warnings}:null;
 }
 function unescapeExcel(s){return s.replace(/_x([0-9a-fA-F]{4})_/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));}
 function stringValue(el){return unescapeExcel(nodes(el,'t').filter(n=>!n.parentElement.closest('rPh')).map(n=>n.textContent).join(''));}
 async function xlsx(bytes){
  guardZIP(bytes);
  let zip;try{zip=await JSZip.loadAsync(bytes);}catch{fail('这不是有效的 .xlsx 文件，请用 Excel 重新保存。');}
  async function read(path){const file=zip.file(path);if(!file)fail('工作簿结构不完整，缺少 '+path);return parseXML(await file.async('string'));}
  const wb=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');
  const targets=new Map(nodes(rels,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  const shared=zip.file('xl/sharedStrings.xml')?nodes(await read('xl/sharedStrings.xml'),'si').map(stringValue):[];
  const articles=[];
  for(const sh of nodes(wb,'sheet')){
   const rid=sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sh.getAttribute('r:id');
   const target=targets.get(rid);if(!target)fail('工作表引用缺失。');
   const parts=[];for(const p of (target.startsWith('/')?target.slice(1):'xl/'+target).split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p);}const path=parts.join('/');
   if(!path.startsWith('xl/'))fail('工作表路径无效。');
   const sheet=await read(path);if(nodes(sheet,'mergeCell').length)fail(`工作表「${sh.getAttribute('name')}」有合并单元格，请取消合并后导入。`);
   const rows=[];
   for(const row of nodes(sheet,'row')){
    const cells={};for(const c of [...row.children].filter(c=>c.localName==='c')){
     const ref=c.getAttribute('r')||'',m=ref.match(/^([A-Z]+)/);if(!m)continue;let col=0;for(const letter of m[1])col=col*26+letter.charCodeAt(0)-64;
     if(nodes(c,'f').length)fail(`${ref} 包含公式，请先复制并粘贴为值。`);
     const kind=c.getAttribute('t');let value=text(c,'v');
     if(kind==='s'){const n=Number(value);if(!Number.isInteger(n)||n<0||n>=shared.length)fail(`${ref} 的文本索引损坏。`);value=shared[n];}
     else if(kind==='inlineStr')value=stringValue(c);
     else if(kind==='e')fail(`${ref} 是 Excel 错误值，请修正后导入。`);
     else value=unescapeExcel(value);
     cells[col-1]=value;
    }
    rows.push([Number(row.getAttribute('r'))||rows.length+1,cells]);
   }
   const article=toArticle(rows,sh.getAttribute('name')||'未命名文章');if(article)articles.push(article);
   if(articles.length>50)fail('一次最多导入 50 张非空工作表。');
  }
  if(!articles.length)fail('没有找到句子。第一列填写句子，第二列填写翻译和解析。');return articles;
 }
 function csvRows(source){
  source=source.replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,afterQuote=false;
  for(let i=0;i<source.length;i++){
   const c=source[i];if(quoted){if(c==='"'){if(source[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}
   if(c==='"'&&!field&&!afterQuote){quoted=true;continue;}
   if(c===','||c==='\n'||c==='\r'){row.push(field);field='';afterQuote=false;if(c!==','){rows.push(row);row=[];if(c==='\r'&&source[i+1]==='\n')i++;}continue;}
   if(afterQuote&&c.trim())fail('CSV 引号格式错误，请重新导出 CSV。');field+=c;
  }
  if(quoted)fail('CSV 存在未闭合的引号，请重新导出。');if(field||row.length||afterQuote){row.push(field);rows.push(row);}return rows;
 }
 function decode(bytes){const a=new Uint8Array(bytes);if(a[0]===0xff&&a[1]===0xfe)return new TextDecoder('utf-16le').decode(a);if(a[0]===0xfe&&a[1]===0xff)return new TextDecoder('utf-16be').decode(a);try{return new TextDecoder('utf-8',{fatal:true}).decode(a);}catch{return new TextDecoder('gb18030',{fatal:true}).decode(a);}}
 async function read(file){if(!file.size||file.size>10*1024*1024)fail('文件须非空且不超过 10 MB。');const bytes=await file.arrayBuffer();if(/\.xlsx$/i.test(file.name))return {articles:await xlsx(bytes)};if(/\.csv$/i.test(file.name)){const a=toArticle(csvRows(decode(bytes)).map((r,i)=>[i+1,r]),file.name.replace(/\.csv$/i,''));if(!a)fail('CSV 中没有句子。');return {articles:[a]};}fail('仅支持 .xlsx 和 .csv。');}
 return {read};
})();
