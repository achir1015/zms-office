/* 擴充功能（開發人員）：巨集錄製／管理、Google Apps Script 相容層、自訂選單（onOpen）。
 *
 * Apps Script 相容層：把 Google 的 SpreadsheetApp／DocumentApp／SlidesApp／Logger／Browser／Utilities
 * 對應到 ONLYOFFICE 的文件 API（Api.*），讓同一份 .gs 程式可以在這裡跑，也可以貼回 Google 使用。
 * 程式在編輯器內的沙盒（safePluginEval）執行，只能存取這份文件。 */
(function () {
  const ZO = window.ZO;
  const { h, t, $ } = ZO;
  const E = () => window.ZOE;
  const KINDNAME = { word: 'DocumentApp', cell: 'SpreadsheetApp', slide: 'SlidesApp' };

  // ---------------------------------------------------------------- 相容層（字串，送進編輯器執行）
  const SHIM = String.raw`
var __log=[], __ui=[], __menus=[], __doc=Api.GetDocument ? Api.GetDocument() : null;
function __s(v){ try { return typeof v==='string' ? v : JSON.stringify(v); } catch(e){ return String(v); } }
var Logger={ log:function(){ __log.push(Array.prototype.map.call(arguments,__s).join(' ')); return Logger; }, clear:function(){ __log=[]; }, getLog:function(){ return __log.join('\n'); } };
var console={ log:Logger.log, info:Logger.log, warn:Logger.log, error:Logger.log };
var __NAMED={red:[255,0,0],green:[0,128,0],blue:[0,0,255],black:[0,0,0],white:[255,255,255],yellow:[255,255,0],orange:[255,165,0],gray:[128,128,128],grey:[128,128,128],purple:[128,0,128],pink:[255,192,203]};
function __rgb(c){ c=String(c||'#000').trim().toLowerCase(); if(__NAMED[c]) return __NAMED[c]; c=c.replace('#',''); if(c.length===3) c=c.replace(/(.)/g,'$1$1'); var n=parseInt(c,16)||0; return [(n>>16)&255,(n>>8)&255,n&255]; }
function __col(c){ var r=__rgb(c); return Api.CreateColorFromRGB(r[0],r[1],r[2]); }
function __fill(c){ var r=__rgb(c); return Api.CreateSolidFill(Api.CreateRGBColor(r[0],r[1],r[2])); }
function __a1(r,c){ var s=''; c=c+1; while(c>0){ var m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=Math.floor((c-1)/26); } return s+(r+1); }
function __parseA1(a){ var m=String(a).replace(/\$/g,'').match(/^([A-Z]+)(\d+)$/i); if(!m) throw new Error('看不懂的儲存格位址：'+a); var c=0; for(var i=0;i<m[1].length;i++) c=c*26+(m[1].toUpperCase().charCodeAt(i)-64); return [parseInt(m[2],10)-1,c-1]; }
function __num(v){ if(typeof v==='string' && v!=='' && !isNaN(Number(v)) && !/^0\d/.test(v)) return Number(v); if(v==='TRUE') return true; if(v==='FALSE') return false; return v; }
var Utilities={ sleep:function(){}, formatDate:function(d,tz,f){ d=new Date(d); var p=function(n){return (n<10?'0':'')+n;}; return String(f||'yyyy-MM-dd').replace('yyyy',d.getFullYear()).replace('MM',p(d.getMonth()+1)).replace('dd',p(d.getDate())).replace('HH',p(d.getHours())).replace('mm',p(d.getMinutes())).replace('ss',p(d.getSeconds())); }, getUuid:function(){ return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);}); } };
var Session={ getActiveUser:function(){ return { getEmail:function(){ return __USER; } }; }, getScriptTimeZone:function(){ return 'Asia/Taipei'; } };
var PropertiesService={ getScriptProperties:function(){ return { getProperty:function(){return null;}, setProperty:function(){} }; }, getDocumentProperties:function(){ return PropertiesService.getScriptProperties(); }, getUserProperties:function(){ return PropertiesService.getScriptProperties(); } };
function __Ui(){ }
__Ui.prototype={ alert:function(a,b){ __ui.push(['alert', b!==undefined && typeof a==='string' && typeof b==='string' ? a+'\n'+b : a]); return 'OK'; },
  prompt:function(m){ __ui.push(['alert','（ui.prompt 在這裡無法等待輸入，已略過）'+m]); return { getResponseText:function(){return '';}, getSelectedButton:function(){return 'CANCEL';} }; },
  createMenu:function(name){ var m={name:name, items:[]}; var o={ addItem:function(label,fn){ m.items.push([label,fn]); return o; }, addSeparator:function(){ m.items.push(['-','']); return o; }, addSubMenu:function(sub){ (sub.__m.items||[]).forEach(function(x){ m.items.push([sub.__m.name+' › '+x[0], x[1]]); }); return o; }, addToUi:function(){ __menus.push(m); }, __m:m }; return o; },
  createAddonMenu:function(){ return this.createMenu('外掛程式'); },
  ButtonSet:{OK:'OK',OK_CANCEL:'OK_CANCEL',YES_NO:'YES_NO',YES_NO_CANCEL:'YES_NO_CANCEL'}, Button:{OK:'OK',CANCEL:'CANCEL',YES:'YES',NO:'NO',CLOSE:'CLOSE'} };
var Browser={ msgBox:function(a,b){ __ui.push(['alert', b!==undefined ? a+'\n'+b : a]); return 'ok'; }, inputBox:function(){ return 'cancel'; }, Buttons:{OK:'OK'} };

/* ===== Google 試算表 ===== */
function __Range(sh,r,c,nr,nc){ this.sh=sh; this.r=r; this.c=c; this.nr=nr||1; this.nc=nc||1; }
__Range.prototype={
  _rng:function(){ return this.sh.GetRange(this.nr===1&&this.nc===1 ? __a1(this.r,this.c) : __a1(this.r,this.c)+':'+__a1(this.r+this.nr-1,this.c+this.nc-1)); },
  _cell:function(i,j){ return this.sh.GetRangeByNumber(this.r+i,this.c+j); },
  _each:function(f){ for(var i=0;i<this.nr;i++) for(var j=0;j<this.nc;j++) f(this._cell(i,j),i,j); return this; },
  getValue:function(){ return __num(this._cell(0,0).GetValue()); },
  getValues:function(){ var out=[]; for(var i=0;i<this.nr;i++){ var row=[]; for(var j=0;j<this.nc;j++) row.push(__num(this._cell(i,j).GetValue())); out.push(row); } return out; },
  getDisplayValue:function(){ var c=this._cell(0,0); return c.GetText ? c.GetText() : String(c.GetValue()); },
  getDisplayValues:function(){ var self=this; return this.getValues().map(function(r,i){ return r.map(function(v,j){ var c=self._cell(i,j); return c.GetText?c.GetText():String(v); }); }); },
  setValue:function(v){ return this._each(function(c){ c.SetValue(v); }); },
  setValues:function(a){ if(!a || a.length!==this.nr || (a[0]||[]).length!==this.nc) throw new Error('setValues 的資料大小 ('+a.length+'×'+((a[0]||[]).length)+') 和範圍 ('+this.nr+'×'+this.nc+') 不一致'); return this._each(function(c,i,j){ c.SetValue(a[i][j]); }); },
  getFormula:function(){ var c=this._cell(0,0); return c.GetFormula ? c.GetFormula() : ''; },
  getFormulas:function(){ var out=[]; for(var i=0;i<this.nr;i++){ var row=[]; for(var j=0;j<this.nc;j++){ var c=this._cell(i,j); row.push(c.GetFormula?c.GetFormula():''); } out.push(row); } return out; },
  setFormula:function(f){ return this.setValue(f); }, setFormulas:function(a){ return this.setValues(a); },
  setFormulaR1C1:function(f){ return this.setValue(f); },
  setBackground:function(c){ this._rng().SetFillColor(__col(c)); return this; }, setBackgroundRGB:function(r,g,b){ this._rng().SetFillColor(Api.CreateColorFromRGB(r,g,b)); return this; },
  setFontColor:function(c){ this._rng().SetFontColor(__col(c)); return this; },
  setFontWeight:function(w){ this._rng().SetBold(w==='bold'); return this; },
  setFontStyle:function(s){ this._rng().SetItalic(s==='italic'); return this; },
  setFontLine:function(s){ if(s==='underline') this._rng().SetUnderline('single'); if(s==='line-through') this._rng().SetStrikeout(true); return this; },
  setFontSize:function(n){ this._rng().SetFontSize(n); return this; },
  setFontFamily:function(f){ this._rng().SetFontName(f); return this; },
  setNumberFormat:function(f){ this._rng().SetNumberFormat(f); return this; },
  setHorizontalAlignment:function(a){ this._rng().SetAlignHorizontal({left:'left',center:'center',right:'right',normal:'general'}[String(a).toLowerCase()]||'general'); return this; },
  setVerticalAlignment:function(a){ this._rng().SetAlignVertical({top:'top',middle:'center',center:'center',bottom:'bottom'}[String(a).toLowerCase()]||'bottom'); return this; },
  setWrap:function(b){ this._rng().SetWrap(!!b); return this; },
  setBorder:function(top,left,bottom,right,v,hz,color){ var r=this._rng(), col=__col(color||'#000'); if(top) r.SetBorders('Top','Thin',col); if(left) r.SetBorders('Left','Thin',col); if(bottom) r.SetBorders('Bottom','Thin',col); if(right) r.SetBorders('Right','Thin',col); if(v) r.SetBorders('InsideVertical','Thin',col); if(hz) r.SetBorders('InsideHorizontal','Thin',col); return this; },
  merge:function(){ this._rng().Merge(false); return this; }, mergeAcross:function(){ this._rng().Merge(true); return this; }, breakApart:function(){ this._rng().UnMerge(); return this; },
  clear:function(){ this._rng().Clear(); return this; }, clearContent:function(){ return this.setValue(''); }, clearFormat:function(){ return this; },
  setNote:function(n){ try { this._cell(0,0).AddComment(String(n)); } catch(e){} return this; },
  activate:function(){ this._rng().Select(); return this; },
  getA1Notation:function(){ return this.nr===1&&this.nc===1 ? __a1(this.r,this.c) : __a1(this.r,this.c)+':'+__a1(this.r+this.nr-1,this.c+this.nc-1); },
  getRow:function(){ return this.r+1; }, getColumn:function(){ return this.c+1; }, getNumRows:function(){ return this.nr; }, getNumColumns:function(){ return this.nc; },
  getLastRow:function(){ return this.r+this.nr; }, getLastColumn:function(){ return this.c+this.nc; },
  getSheet:function(){ return new __Sheet(this.sh); },
  offset:function(r,c,nr,nc){ return new __Range(this.sh,this.r+r,this.c+c,nr||this.nr,nc||this.nc); },
  getCell:function(r,c){ return new __Range(this.sh,this.r+r-1,this.c+c-1,1,1); },
  autoFit:function(){ try{ this._rng().AutoFit(false,true); }catch(e){} return this; },
  sort:function(){ throw new Error('range.sort 尚未支援，請改用「資料 → 排序」'); }
};
function __Sheet(ws){ this.ws=ws; }
__Sheet.prototype={
  getName:function(){ return this.ws.GetName(); }, getSheetName:function(){ return this.ws.GetName(); }, setName:function(n){ this.ws.SetName(n); return this; },
  getRange:function(a,b,c,d){ if(typeof a==='string'){ var s=a.indexOf('!')>=0 ? a.split('!').pop() : a; var p=s.split(':'); var x=__parseA1(p[0]); var y=p[1]?__parseA1(p[1]):x; return new __Range(this.ws,Math.min(x[0],y[0]),Math.min(x[1],y[1]),Math.abs(y[0]-x[0])+1,Math.abs(y[1]-x[1])+1); } return new __Range(this.ws,a-1,b-1,c||1,d||1); },
  _used:function(){ var u=this.ws.GetUsedRange(); var adr=u.GetAddress(false,false); var p=adr.split(':'); var x=__parseA1(p[0]); var y=p[1]?__parseA1(p[1]):x; return [x,y]; },
  getDataRange:function(){ var u=this._used(); return new __Range(this.ws,0,0,u[1][0]+1,u[1][1]+1); },
  getLastRow:function(){ var u=this._used(); var v=this.ws.GetRangeByNumber(u[1][0],u[1][1]); return (u[0][0]===0&&u[1][0]===0&&u[1][1]===0&&String(v.GetValue())==='') ? 0 : u[1][0]+1; },
  getLastColumn:function(){ var u=this._used(); return this.getLastRow()===0 ? 0 : u[1][1]+1; },
  getMaxRows:function(){ return 1048576; }, getMaxColumns:function(){ return 16384; },
  appendRow:function(arr){ var r=this.getLastRow(); for(var j=0;j<arr.length;j++) this.ws.GetRangeByNumber(r,j).SetValue(arr[j]); return this; },
  clear:function(){ this.ws.GetUsedRange().Clear(); return this; }, clearContents:function(){ return this.clear(); },
  activate:function(){ this.ws.SetActive(); return this; },
  setColumnWidth:function(col,px){ this.ws.SetColumnWidth(col-1, px/7); return this; },
  setRowHeight:function(row,px){ this.ws.SetRowHeight(row-1, px*0.75); return this; },
  setFrozenRows:function(n){ try{ this.ws.GetFreezePanes().FreezeRows(n); }catch(e){} return this; },
  setFrozenColumns:function(n){ try{ this.ws.GetFreezePanes().FreezeColumns(n); }catch(e){} return this; },
  autoResizeColumns:function(c,n){ for(var i=0;i<(n||1);i++) try{ this.ws.GetRange(__a1(0,c-1+i)).AutoFit(false,true); }catch(e){} return this; },
  getActiveCell:function(){ var a=this.ws.GetActiveCell(); return new __Range(this.ws,a.GetRow()-1,a.GetCol()-1,1,1); },
  getIndex:function(){ return this.ws.GetIndex()+1; },
  deleteRow:function(){ throw new Error('deleteRow 尚未支援'); }
};
function __Spreadsheet(){ }
__Spreadsheet.prototype={
  getActiveSheet:function(){ return new __Sheet(Api.GetActiveSheet()); },
  getSheets:function(){ return Api.GetSheets().map(function(s){ return new __Sheet(s); }); },
  getSheetByName:function(n){ var s=Api.GetSheet(n); return s ? new __Sheet(s) : null; },
  insertSheet:function(n){ Api.AddSheet(n||('工作表'+(Api.GetSheets().length+1))); return new __Sheet(Api.GetActiveSheet()); },
  deleteSheet:function(sh){ sh.ws.Delete(); },
  getRange:function(a){ if(String(a).indexOf('!')>0){ var p=a.split('!'); return this.getSheetByName(p[0].replace(/'/g,'')).getRange(p[1]); } return this.getActiveSheet().getRange(a); },
  getActiveRange:function(){ var s=Api.GetSelection(); var sh=new __Sheet(Api.GetActiveSheet()); return sh.getRange(s.GetAddress(false,false)); },
  getName:function(){ return __NAME; }, getId:function(){ return __ID; }, getUrl:function(){ return ''; },
  getUi:function(){ return new __Ui(); }, toast:function(m,title){ __ui.push(['toast', (title?title+'：':'')+m]); },
  getSheetName:function(){ return Api.GetActiveSheet().GetName(); }
};
var SpreadsheetApp={ getActiveSpreadsheet:function(){ return new __Spreadsheet(); }, getActive:function(){ return new __Spreadsheet(); },
  getActiveSheet:function(){ return new __Spreadsheet().getActiveSheet(); }, getActiveRange:function(){ return new __Spreadsheet().getActiveRange(); },
  getUi:function(){ return new __Ui(); }, flush:function(){},
  openById:function(){ throw new Error('openById：這裡只能操作目前開啟的試算表'); }, openByUrl:function(){ throw new Error('openByUrl：這裡只能操作目前開啟的試算表'); },
  BorderStyle:{SOLID:'Thin',DOTTED:'Dotted',DASHED:'Dashed'}, Dimension:{COLUMNS:'COLUMNS',ROWS:'ROWS'} };

/* ===== Google 文件 ===== */
var __HEAD={NORMAL:'Normal',HEADING1:'Heading 1',HEADING2:'Heading 2',HEADING3:'Heading 3',HEADING4:'Heading 4',HEADING5:'Heading 5',HEADING6:'Heading 6',TITLE:'Title',SUBTITLE:'Subtitle'};
function __runs(p,f){ var n=p.GetElementsCount(); for(var i=0;i<n;i++){ var r=p.GetElement(i); if(r && r.SetBold) f(r); } }
function __Para(p){ this.p=p; }
__Para.prototype={
  getText:function(){ return this.p.GetText().replace(/\r?\n$/,''); },
  setText:function(t){ this.p.RemoveAllElements(); this.p.AddText(String(t)); return this; },
  appendText:function(t){ this.p.AddText(String(t)); return this; },
  setHeading:function(hd){ var st=__doc.GetStyle(__HEAD[hd]||hd); if(st) this.p.SetStyle(st); return this; },
  setAlignment:function(a){ this.p.SetJc({LEFT:'left',CENTER:'center',RIGHT:'right',JUSTIFY:'both'}[a]||'left'); return this; },
  setBold:function(b){ __runs(this.p,function(r){ r.SetBold(b!==false); }); return this; },
  setItalic:function(b){ __runs(this.p,function(r){ r.SetItalic(b!==false); }); return this; },
  setUnderline:function(b){ __runs(this.p,function(r){ r.SetUnderline(b!==false); }); return this; },
  setFontSize:function(n){ __runs(this.p,function(r){ r.SetFontSize(n*2); }); return this; },
  setFontFamily:function(f){ __runs(this.p,function(r){ r.SetFontFamily(f); }); return this; },
  setForegroundColor:function(c){ var x=__rgb(c); __runs(this.p,function(r){ r.SetColor(x[0],x[1],x[2]); }); return this; },
  setBackgroundColor:function(c){ var x=__rgb(c); this.p.SetShd('clear',x[0],x[1],x[2]); return this; },
  setSpacingAfter:function(pt){ this.p.SetSpacingAfter(pt*20); return this; }, setSpacingBefore:function(pt){ this.p.SetSpacingBefore(pt*20); return this; },
  setLineSpacing:function(m){ this.p.SetSpacingLine(m*240,'auto'); return this; },
  setIndentFirstLine:function(pt){ this.p.SetIndFirstLine(pt*20); return this; }, setIndentStart:function(pt){ this.p.SetIndLeft(pt*20); return this; },
  editAsText:function(){ return this; }, asText:function(){ return this; }, asParagraph:function(){ return this; },
  setAttributes:function(){ return this; }, getType:function(){ return 'PARAGRAPH'; }
};
function __Table(t){ this.t=t; }
__Table.prototype={ getNumRows:function(){ return this.t.GetRowsCount(); },
  getRow:function(i){ var row=this.t.GetRow(i); return { getCell:function(j){ var cell=row.GetCell(j); return { getText:function(){ return cell.GetContent().GetElement(0).GetText().replace(/\r?\n$/,''); }, setText:function(s){ var p=cell.GetContent().GetElement(0); p.RemoveAllElements(); p.AddText(String(s)); return this; }, setBackgroundColor:function(c){ var x=__rgb(c); cell.SetShd('clear',x[0],x[1],x[2]); return this; } }; } }; },
  getCell:function(i,j){ return this.getRow(i).getCell(j); } };
function __Body(){ }
__Body.prototype={
  appendParagraph:function(t){ var p=Api.CreateParagraph(); if(t) p.AddText(String(t)); __doc.Push(p); return new __Para(p); },
  insertParagraph:function(i,t){ var p=Api.CreateParagraph(); if(t) p.AddText(String(t)); __doc.AddElement(i,p); return new __Para(p); },
  appendListItem:function(t){ var p=Api.CreateParagraph(); p.AddText(String(t)); if(!__Body.__num) __Body.__num=__doc.CreateNumbering('bullet'); p.SetNumbering(__Body.__num.GetLevel(0)); __doc.Push(p); return new __Para(p); },
  appendTable:function(cells){ cells=cells||[['']]; var rows=cells.length, cols=Math.max.apply(null,cells.map(function(r){return r.length;})); var tb=Api.CreateTable(cols,rows); tb.SetWidth('percent',100); try{ tb.SetStyle(__doc.GetStyle('Table Grid')); }catch(e){} for(var i=0;i<rows;i++) for(var j=0;j<cols;j++){ var v=cells[i][j]; if(v!==undefined && v!=='') tb.GetRow(i).GetCell(j).GetContent().GetElement(0).AddText(String(v)); } __doc.Push(tb); return new __Table(tb); },
  appendPageBreak:function(){ var p=Api.CreateParagraph(); p.AddPageBreak(); __doc.Push(p); return this; },
  appendHorizontalRule:function(){ var p=Api.CreateParagraph(); p.SetBottomBorder('single',8,0,128,128,128); __doc.Push(p); return this; },
  appendImage:function(){ throw new Error('appendImage 尚未支援，請用「插入 → 圖片」'); },
  getText:function(){ return __doc.GetAllParagraphs().map(function(p){ return p.GetText().replace(/\r?\n$/,''); }).join('\n'); },
  setText:function(t){ this.clear(); this.appendParagraph(t); return this; },
  clear:function(){ __doc.RemoveAllElements(); return this; },
  replaceText:function(a,b){ __doc.SearchAndReplace({searchString:String(a).replace(/\\(.)/g,'$1'), replaceString:String(b), matchCase:true}); return this; },
  getParagraphs:function(){ return __doc.GetAllParagraphs().map(function(p){ return new __Para(p); }); },
  getTables:function(){ return __doc.GetAllTables ? __doc.GetAllTables().map(function(t){ return new __Table(t); }) : []; },
  getNumChildren:function(){ return __doc.GetElementsCount(); },
  getChild:function(i){ var e=__doc.GetElement(i); return e && e.AddText ? new __Para(e) : new __Table(e); },
  editAsText:function(){ return this; }
};
function __Document(){ }
__Document.prototype={ getBody:function(){ return new __Body(); }, getName:function(){ return __NAME; }, getId:function(){ return __ID; }, getUrl:function(){ return ''; },
  saveAndClose:function(){}, getCursor:function(){ return null; }, getSelection:function(){ return null; }, getUi:function(){ return new __Ui(); } };
var DocumentApp={ getActiveDocument:function(){ return new __Document(); }, getUi:function(){ return new __Ui(); },
  openById:function(){ throw new Error('openById：這裡只能操作目前開啟的文件'); }, create:function(){ throw new Error('create：請用「新增」建立文件'); },
  ParagraphHeading:{NORMAL:'NORMAL',HEADING1:'HEADING1',HEADING2:'HEADING2',HEADING3:'HEADING3',HEADING4:'HEADING4',HEADING5:'HEADING5',HEADING6:'HEADING6',TITLE:'TITLE',SUBTITLE:'SUBTITLE'},
  HorizontalAlignment:{LEFT:'LEFT',CENTER:'CENTER',RIGHT:'RIGHT',JUSTIFY:'JUSTIFY'} };

/* ===== Google 簡報 ===== */
var __EMU=12700;
function __pres(){ return Api.GetPresentation(); }
function __TextRange(sh){ this.sh=sh; }
__TextRange.prototype={
  _c:function(){ return this.sh.GetDocContent(); },
  asString:function(){ var c=this._c(), out=[]; for(var i=0;i<c.GetElementsCount();i++) out.push(c.GetElement(i).GetText().replace(/\r?\n$/,'')); return out.join('\n'); },
  setText:function(t){ var c=this._c(); c.RemoveAllElements(); String(t).split('\n').forEach(function(line){ var p=Api.CreateParagraph(); p.AddText(line); c.Push(p); }); return this; },
  appendText:function(t){ var c=this._c(); var p=c.GetElement(c.GetElementsCount()-1); p.AddText(String(t)); return this; },
  getTextStyle:function(){ var c=this._c(); var each=function(f){ for(var i=0;i<c.GetElementsCount();i++) __runs(c.GetElement(i),f); }; var o={ setFontSize:function(n){ each(function(r){ r.SetFontSize(n*2); }); return o; }, setBold:function(b){ each(function(r){ r.SetBold(b!==false); }); return o; }, setItalic:function(b){ each(function(r){ r.SetItalic(b!==false); }); return o; }, setForegroundColor:function(c2){ var x=__rgb(c2); each(function(r){ r.SetFill(Api.CreateSolidFill(Api.CreateRGBColor(x[0],x[1],x[2]))); }); return o; }, setFontFamily:function(f){ each(function(r){ r.SetFontFamily(f); }); return o; } }; return o; },
  getParagraphStyle:function(){ var c=this._c(); var o={ setParagraphAlignment:function(a){ for(var i=0;i<c.GetElementsCount();i++) c.GetElement(i).SetJc({START:'left',CENTER:'center',END:'right',JUSTIFIED:'both'}[a]||'left'); return o; } }; return o; }
};
function __Shape(sh){ this.sh=sh; }
__Shape.prototype={ getText:function(){ return new __TextRange(this.sh); },
  setLeft:function(v){ this.sh.SetPosX(v*__EMU); return this; }, setTop:function(v){ this.sh.SetPosY(v*__EMU); return this; },
  setWidth:function(v){ this.sh.SetSize(v*__EMU, this.sh.GetHeight()); return this; }, setHeight:function(v){ this.sh.SetSize(this.sh.GetWidth(), v*__EMU); return this; },
  getFill:function(){ var s=this.sh; return { setSolidFill:function(c){ s.SetFill(__fill(c)); } }; },
  getBorder:function(){ var s=this.sh; return { setTransparent:function(){ s.SetLine(Api.CreateStroke(0,Api.CreateNoFill())); } }; },
  remove:function(){ this.sh.Delete(); } };
function __Slide(s){ this.s=s; }
__Slide.prototype={
  insertShape:function(type,l,tp,w,hh){ var sh=Api.CreateShape({RECTANGLE:'rect',ELLIPSE:'ellipse',ROUND_RECTANGLE:'roundRect',TEXT_BOX:'rect'}[type]||'rect',(w||200)*__EMU,(hh||60)*__EMU,__fill('#4472c4'),Api.CreateStroke(0,Api.CreateNoFill())); sh.SetPosition((l||0)*__EMU,(tp||0)*__EMU); this.s.AddObject(sh); return new __Shape(sh); },
  insertTextBox:function(t,l,tp,w,hh){ var sh=Api.CreateShape('rect',(w||400)*__EMU,(hh||60)*__EMU,Api.CreateNoFill(),Api.CreateStroke(0,Api.CreateNoFill())); sh.SetPosition((l||40)*__EMU,(tp||40)*__EMU); this.s.AddObject(sh); var tr=new __TextRange(sh); tr.setText(t||''); return new __Shape(sh); },
  insertImage:function(url,l,tp,w,hh){ var im=Api.CreateImage(url,(w||300)*__EMU,(hh||200)*__EMU); im.SetPosition((l||40)*__EMU,(tp||40)*__EMU); this.s.AddObject(im); return im; },
  getShapes:function(){ return this.s.GetAllShapes().map(function(x){ return new __Shape(x); }); },
  getPageElements:function(){ return this.getShapes(); },
  getBackground:function(){ var s=this.s; return { setSolidFill:function(c){ s.SetBackground(__fill(c)); } }; },
  remove:function(){ this.s.Delete(); }, duplicate:function(){ return new __Slide(this.s.Duplicate()); }, getObjectId:function(){ return String(this.s.GetSlideIndex ? this.s.GetSlideIndex() : ''); }
};
function __Presentation(){ }
__Presentation.prototype={ getSlides:function(){ var p=__pres(), out=[]; for(var i=0;i<p.GetSlidesCount();i++) out.push(new __Slide(p.GetSlideByIndex(i))); return out; },
  appendSlide:function(){ var s=Api.CreateSlide(); __pres().AddSlide(s); return new __Slide(s); },
  insertSlide:function(i){ var s=Api.CreateSlide(); __pres().AddSlide(s); try{ s.MoveTo(i); }catch(e){} return new __Slide(s); },
  getName:function(){ return __NAME; }, getId:function(){ return __ID; },
  getPageWidth:function(){ return (__pres().GetWidth ? __pres().GetWidth() : 12192000)/__EMU; }, getPageHeight:function(){ return (__pres().GetHeight ? __pres().GetHeight() : 6858000)/__EMU; } };
var SlidesApp={ getActivePresentation:function(){ return new __Presentation(); }, getUi:function(){ return new __Ui(); },
  ShapeType:{RECTANGLE:'RECTANGLE',ELLIPSE:'ELLIPSE',ROUND_RECTANGLE:'ROUND_RECTANGLE',TEXT_BOX:'TEXT_BOX'},
  ParagraphAlignment:{START:'START',CENTER:'CENTER',END:'END',JUSTIFIED:'JUSTIFIED'}, PredefinedLayout:{BLANK:'BLANK',TITLE_AND_BODY:'TITLE_AND_BODY'} };
function __makeSlides(data){
  var pr=new __Presentation(), W=pr.getPageWidth(), H=pr.getPageHeight();
  data.forEach(function(d,i){
    var s=pr.appendSlide();
    if(i===0){ s.getBackground().setSolidFill('#2b579a'); var tt=s.insertTextBox(d.title||'',W*0.08,H*0.32,W*0.84,H*0.2); tt.getText().getTextStyle().setFontSize(40).setBold(true).setForegroundColor('#ffffff'); var st=s.insertTextBox((d.bullets||[]).join('\n'),W*0.08,H*0.55,W*0.84,H*0.15); st.getText().getTextStyle().setFontSize(20).setForegroundColor('#dfe8f6'); return; }
    var bar=s.insertShape('RECTANGLE',0,0,W,H*0.16); bar.getFill().setSolidFill('#2b579a');
    var ti=s.insertTextBox(d.title||'',W*0.05,H*0.025,W*0.9,H*0.11); ti.getText().getTextStyle().setFontSize(30).setBold(true).setForegroundColor('#ffffff');
    var b=s.insertTextBox((d.bullets||[]).map(function(x){ return '• '+x; }).join('\n'),W*0.07,H*0.22,W*0.86,H*0.7); b.getText().getTextStyle().setFontSize(22).setForegroundColor('#333333');
  });
}
`;
  const IDENT = /^[A-Za-z_$][\w$]*$/;
  function build(code, fn, lang) {
    if (lang === 'oo') return '(function(){ var __log=[]; try { ' + code + '\n; return JSON.stringify({log:__log}); } catch(e) { return JSON.stringify({log:__log, error:String(e && e.message || e)}); } })()';
    const info = E().info || {};
    const call = fn && IDENT.test(fn) ? 'if (typeof ' + fn + " !== 'function') throw new Error('找不到函式 " + fn + "');\n" + fn + '();' : '';
    return '(function(){ var __NAME=' + JSON.stringify(info.name || '') + ', __ID=' + JSON.stringify(String(info.id || '')) + ', __USER=' + JSON.stringify((ZO.S && ZO.S.user && ZO.S.user.uid) || '') + ';\n' + SHIM +
      '\ntry { (function(){\n' + code + '\n;' + call + '\n})(); } catch(e) { return JSON.stringify({log:__log, ui:__ui, menus:__menus.map(function(m){ return {name:m.name, items:m.items.map(function(x){ return [x[0], typeof x[1]==="function" ? x[1].name : String(x[1])]; })}; }), error: String(e && e.message || e)}); }\n' +
      'return JSON.stringify({log:__log, ui:__ui, menus:__menus.map(function(m){ return {name:m.name, items:m.items.map(function(x){ return [x[0], typeof x[1]==="function" ? x[1].name : String(x[1])]; })}; })});\n})()';
  }
  // 執行：回傳 {log:[], ui:[], menus:[], error}
  function run(code, fn, lang, opts) {
    opts = opts || {};
    let raw;
    try { raw = opts.readonly ? E().readBuilder(build(code, fn, lang)) : E().runBuilder(build(code, fn, lang)); } catch (e) { return { log: [], error: e.message }; }
    let r;
    try { r = raw ? JSON.parse(raw) : { log: [], error: t('程式有語法錯誤，或執行時發生錯誤（詳細內容請看瀏覽器主控台）') }; } catch (e) { r = { log: [String(raw)] }; }
    (r.ui || []).forEach(([k, m]) => (k === 'toast' ? ZO.toast(m) : ZO.alert(String(m), t('程式訊息'))));
    if (r.menus && r.menus.length && opts.source) setMenus(r.menus, opts.source);
    return r;
  }
  ZO.Gas = { run, build };
  ZO.Gas.makeSlides = (data) => run('__makeSlides(' + JSON.stringify(data) + ');', '', 'gas');

  // ---------------------------------------------------------------- 自訂選單（onOpen 裡 ui.createMenu().addToUi()）
  const MENUS = {};
  function setMenus(menus, source) {
    MENUS[source.id] = { menus, source };
    const box = $('#custom-menus');
    box.innerHTML = '';
    for (const { menus: ms, source: src } of Object.values(MENUS)) {
      for (const m of ms) {
        box.append(h('button', { class: 'mb', onclick: (ev) => ZO.menu(ev.currentTarget, m.items.map(([label, fn]) => label === '-' ? '-' : [label, () => runNamed(src, fn)])) }, m.name + ' ▾'));
      }
    }
  }
  function runNamed(src, fn) {
    const r = run(src.code, fn, src.lang, { source: src });
    if (r.error) ZO.alert(r.error, t('程式錯誤'));
    else ZO.toast(t('已執行') + '：' + fn, 'ok');
  }
  // 文件開好後：執行「綁定這份文件」的程式的 onOpen（像 Google 的簡易觸發程序）
  ZO.Gas.onOpen = async function () {
    if (!ZO.S || !ZO.S.user) return;
    let list;
    try { list = await ZO.get('scripts', { kind: E().kind, doc: E().info.id }); } catch (e) { return; }
    for (const s of list.filter((x) => x.doc_id && +x.doc_id === +E().info.id && x.lang === 'gas' && /function\s+onOpen\s*\(/.test(x.code))) {
      const r = run(s.code, 'onOpen', 'gas', { source: s });
      if (r.error) ZO.toast(t('「{0}」的 onOpen 發生錯誤：', s.name) + r.error, 'err');
    }
  };

  // ---------------------------------------------------------------- 擴充功能選單
  ZO.Gas.menu = function (at) {
    const P = window.parent.ZO;
    const dev = P.can('DEV', 1), dev2 = P.can('DEV', 2);
    const rec = E().api() && E().api().getMacroRecorder && E().api().getMacroRecorder();
    const recording = rec && rec.isInProgress();
    const items = [
      [t('外掛程式') + ' ›', () => plugins(at)],
      '-',
      dev2 && rec ? [recording ? '⏹ ' + t('停止錄製巨集') : '⏺ ' + t('錄製巨集…'), () => (recording ? stopRec() : startRec())] : null,
      dev ? [t('巨集…'), () => manage()] : null,
      dev ? ['📜 Apps Script', () => P.Scripts.open({ doc: E().info, kind: E().kind })] : null,
      dev2 ? [t('匯入 .gs 檔…'), () => P.Scripts.importGs({ doc: E().info, kind: E().kind })] : null,
      dev ? null : [t('（需要「開發人員」權限才能使用巨集）'), () => {}, { disabled: true }],
    ];
    ZO.menu(at, items);
  };
  function plugins(at) {
    const k = E().kind;
    ZO.menu(at, [
      ['✨ ' + t('AI 助理'), () => ZO.AIPanel.toggle()],
      k === 'slide' ? ['📒 ' + t('從 NotebookLM 產生簡報…'), () => ZO.Notebook ? ZO.Notebook.open() : ZO.toast(t('即將推出'))] : null,
      k === 'word' || k === 'slide' ? ['🔀 ' + t('插入流程圖…'), () => window.parent.ZO.Diagram ? window.parent.ZO.Diagram.insertInto(window.ZOE) : ZO.toast(t('即將推出'))] : null,
      k === 'word' || k === 'slide' || k === 'pdf' ? ['📖 ' + t('匯出到資料助秘電子書翻頁'), () => $('#m-file').click()] : null,
      ['🔤 ' + t('插入目前日期'), () => E().pasteText(new Date().toLocaleDateString(ZO.lang))],
    ]);
  }
  function startRec() {
    const rec = E().api().getMacroRecorder();
    rec.start(t('巨集') + new Date().toLocaleTimeString().replace(/\D/g, ''));
    ZO.toast(t('開始錄製巨集：接下來的操作都會被記錄，完成後到「擴充功能」按「停止錄製巨集」'), 'ok');
    $('#m-ext').textContent = '⏺ ' + t('錄製中');
  }
  async function stopRec() {
    const e = E().api();
    e.getMacroRecorder().stop();
    $('#m-ext').textContent = t('擴充功能');
    let data = {};
    try { data = JSON.parse(e.asc_getMacros() || '{}'); } catch (err) { /* */ }
    const m = (data.macrosArray || []).slice(-1)[0];
    if (!m) return ZO.toast(t('沒有錄到任何動作'));
    const name = await ZO.prompt(t('巨集名稱'), m.name);
    if (!name) return;
    try {
      await ZO.api('script_save', { name, code: m.value, lang: 'oo', kind: E().kind, doc_id: null });
      ZO.toast(t('巨集已儲存，可在「擴充功能 → 巨集」執行'), 'ok');
    } catch (err) { ZO.err(err); }
  }
  async function manage() {
    let list = [];
    try { list = await ZO.get('scripts', { kind: E().kind, doc: E().info.id }); } catch (e) { return ZO.err(e); }
    let inDoc = [];
    try { inDoc = (JSON.parse(E().api().asc_getMacros() || '{}').macrosArray || []); } catch (e) { /* */ }
    const P = window.parent.ZO;
    let close;
    const fnsOf = (code) => Array.from(String(code).matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)).map((m) => m[1]).filter((n) => n !== 'onOpen' || true);
    const runOne = (s, fn) => {
      const r = run(s.code, fn, s.lang, { source: s });
      if (r.error) ZO.alert(r.error + (r.log && r.log.length ? '\n\n' + r.log.join('\n') : ''), t('程式錯誤'));
      else { ZO.toast(t('執行完成'), 'ok'); if (r.log && r.log.length) ZO.alert(r.log.join('\n'), t('執行紀錄')); }
    };
    const rows = list.map((s) => {
      const fns = s.lang === 'gas' ? fnsOf(s.code) : [];
      const fnSel = fns.length ? ZO.selectEl(fns.map((f) => [f, f]), fns.find((f) => f !== 'onOpen') || fns[0]) : null;
      if (fnSel) fnSel.style.width = '160px';
      return h('tr', {}, h('td', {}, h('b', {}, s.name), h('div', { class: 'hint' }, (s.lang === 'gas' ? 'Apps Script' : t('巨集')) + (s.doc_id ? '・' + t('綁定這份文件') : '') + (s.mine ? '' : '・' + s.owner_name))),
        h('td', {}, fnSel || ''),
        h('td', { style: { whiteSpace: 'nowrap' } }, h('button', { class: 'mini', onclick: () => { close(null); runOne(s, fnSel ? fnSel.value : ''); } }, '▶ ' + t('執行')), ' ',
          P.can('DEV', 2) ? h('button', { class: 'mini', onclick: () => { close(null); P.Scripts.open({ doc: E().info, kind: E().kind, id: s.id }); } }, t('編輯')) : null));
    });
    const docRows = inDoc.map((m) => h('tr', {}, h('td', {}, h('b', {}, m.name), h('div', { class: 'hint' }, t('文件內的巨集（ONLYOFFICE 格式）'))), h('td', {}, ''),
      h('td', {}, h('button', { class: 'mini', onclick: () => { close(null); runOne({ code: m.value, lang: 'oo', id: 'doc-' + m.guid }, ''); } }, '▶ ' + t('執行')))));
    ZO.dialog({ title: t('巨集'), width: '640px', body: h('div', {},
      rows.length || docRows.length ? h('table', { class: 'grid' }, h('tbody', {}, rows, docRows)) : h('p', { class: 'hint' }, t('還沒有巨集。可以用「錄製巨集」，或開啟 Apps Script 編輯器撰寫。')),
      h('p', { class: 'hint' }, t('提示：Apps Script 寫法（SpreadsheetApp、DocumentApp、SlidesApp）的程式也可以直接貼到 Google 試算表／文件／簡報的「擴充功能 → Apps Script」使用。'))),
    buttons: [{ label: t('關閉'), value: null }], onOpen: (b, c) => (close = c) });
  }
  ZO.Gas.kindApp = (k) => KINDNAME[k] || 'SpreadsheetApp';
})();
