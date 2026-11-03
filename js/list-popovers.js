'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const editors = ['financeAdd','financeImport','wishEditor'].map(id => document.getElementById(id));
  function place(editor) {
    const container = editor.closest('#wishlistPanel') || document.querySelector('#financePanel > .section');
    const panel = editor.querySelector('.list-popover'), summary = editor.querySelector(':scope > summary');
    const anchor = summary.getBoundingClientRect(), bounds = container.getBoundingClientRect();
    panel.style.top = (anchor.bottom - bounds.top + container.scrollTop + 10) + 'px';
    panel.style.setProperty('--popover-arrow', Math.max(20,Math.min(bounds.width - 40, anchor.left + anchor.width/2 - bounds.left - 16)) + 'px');
    panel.style.maxHeight = Math.max(160,innerHeight - anchor.bottom - 95) + 'px';
  }
  for (const editor of editors) {
    const summary = editor.querySelector(':scope > summary'), panel = document.createElement('div');
    panel.className = 'list-popover'; panel.setAttribute('aria-label',summary.textContent.trim());
    const close = document.createElement('button'); close.type = 'button'; close.className = 'list-popover-close'; close.textContent = '×'; close.setAttribute('aria-label','Fechar painel');
    close.onclick = () => {editor.open=false;summary.focus({preventScroll:true});}; panel.append(close);
    for (const child of [...editor.children]) if(child !== summary) panel.append(child);
    editor.append(panel);
    editor.addEventListener('toggle', () => { if(editor.open){for(const other of editors) if(other!==editor)other.open=false;place(editor);} });
  }
  document.addEventListener('pointerdown',event=>{if(event.target.closest('dialog,[role="dialog"]'))return;for(const editor of editors)if(editor.open&&!editor.contains(event.target))editor.open=false;});
  document.addEventListener('keydown',event=>{if(event.key!=='Escape'||event.target.closest('dialog,[role="dialog"]'))return;for(const editor of editors)if(editor.open){editor.open=false;editor.querySelector('summary').focus({preventScroll:true});event.preventDefault();}});
  let frame; const reposition=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>editors.filter(editor=>editor.open).forEach(place));};
  window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,{passive:true});
});
