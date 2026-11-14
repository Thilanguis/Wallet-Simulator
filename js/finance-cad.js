'use strict';
window.FinanceCad = (() => {
  const F = Finance;
  let enabled = false;
  const cache = new Map();
  const usable = e => e.currency === 'BRL' && !['cancelled','refunded'].includes(e.status);
  function original(entry) {
    if (entry.source !== 'wishlist') return null;
    const wishes = JSON.parse(AppStorage.getItem('wishlist') || '[]').filter(w => w.purchaseNoteId === entry.id);
    if (!wishes.length || wishes.some(w => w.currency !== 'CAD' || !Number.isFinite(w.originalPrice))) return null;
    let amount = 0;
    for (const wish of wishes) {
      const subtotal = Math.round(wish.originalPrice * 100) * (wish.quantity || 1);
      amount += subtotal + (wish.taxQuebec ? Math.round(subtotal * 0.14975) : 0);
    }
    return { amount, kind:'original', source:'wishlist', basisAmount:entry.amount };
  }
  function record(entry) {
    const saved = entry.cadReference;
    if (saved && saved.basisAmount === entry.amount && (saved.kind === 'original' || saved.entryDate === entry.date)) return saved;
    return original(entry);
  }
  function label(entry) {
    if (!enabled || !usable(entry)) return '';
    const reference = record(entry);
    if (!reference) return '<small class="note-cad">CAD —</small> ';
    const detail = reference.kind === 'original' ? 'Valor original dos itens da Lista de Desejos' : 'Estimativa · 1 CAD = R$ ' + reference.rate + ' · cotação ' + reference.rateDate + (reference.inferredFrom ? ' · data aproximada pelo lançamento vizinho' : '');
    return '<small class="note-cad" title="' + escapeHTML(detail) + '">' + (reference.kind === 'original' ? '' : '≈ ') + F.format(reference.amount,'CAD').replace('CA$','CAD') + '</small> ';
  }
  function totalLabel(entries) {
    if (!enabled) return '';
    const refs = entries.filter(usable).map(record), missing = refs.some(r => !r);
    return '<small class="note-cad">≈ CAD ' + (refs.reduce((n,r)=>n+(r?.amount||0),0)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + (missing ? ' · parcial' : '') + '</small> ';
  }
  function dateFor(entry, entries) {
    if (F.validDate(entry.date)) return {date:entry.date};
    const group = entries.filter(e => e.category === entry.category), index = group.findIndex(e => e.id === entry.id);
    for (let distance=1; distance<group.length; distance++) for (const offset of [-distance,distance]) {
      const other = group[index+offset];
      if (other && F.validDate(other.date)) return {date:other.date,inferredFrom:other.id};
    }
    return null;
  }
  async function rate(date) {
    if (!cache.has(date)) cache.set(date,(async()=>{
      const response=await fetch('https://api.frankfurter.dev/v2/rates?base=CAD&quotes=BRL&date='+date,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('Cotação indisponível.');
      const rows=await response.json(), row=rows.find(r=>r.base==='CAD'&&r.quote==='BRL');
      if(!row||!Number.isFinite(row.rate)||row.rate<=0||!F.validDate(row.date)||row.date>date)throw new Error('Cotação histórica inválida.');
      return row;
    })().catch(error=>{cache.delete(date);throw error;}));
    return cache.get(date);
  }
  async function prepare(entries, progress) {
    const proposals=[];
    for(const entry of entries.filter(usable)) {
      if(record(entry)?.basisAmount===entry.amount && entry.cadReference) continue;
      let reference=original(entry), reason='';
      if(!reference){const basis=dateFor(entry,entries);if(!basis)reason='Sem data de referência';else try{const r=await rate(basis.date);reference={amount:Math.round(entry.amount/r.rate),kind:'estimated',source:'Frankfurter',rate:r.rate,rateDate:r.date,referenceDate:basis.date,entryDate:entry.date,basisAmount:entry.amount,...(basis.inferredFrom?{inferredFrom:basis.inferredFrom}:{})};}catch{reason='Cotação indisponível';}}
      proposals.push({id:entry.id,baseline:JSON.stringify(entry),description:entry.description,reference,reason});progress?.(proposals.length);
    }
    return proposals;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const toggle=document.getElementById('financeShowCad'), button=document.getElementById('financePrepareCad');
    toggle.onchange=()=>{enabled=toggle.checked;FinanceUI.render();};
    button.onclick=async()=>{
      button.disabled=true;button.textContent='Consultando…';
      try {
        const proposals=await prepare(FinanceUI.getState().entries,n=>button.textContent='Consultando · '+n);
        const ready=proposals.filter(p=>p.reference), dialog=document.createElement('dialog');dialog.className='note-edit-dialog cad-review';
        dialog.innerHTML='<h2>Referências em CAD</h2><p class="hint">Valores estimados não alteram os gastos em reais nem as datas originais.</p><div class="cad-review-list">'+proposals.map(p=>'<p><span>'+escapeHTML(p.description)+'</span><strong>'+(p.reference?F.format(p.reference.amount,'CAD'):'—')+'</strong><small>'+escapeHTML(p.reason||(p.reference.kind==='original'?'Original da Lista de Desejos':p.reference.referenceDate+' · cotação '+p.reference.rateDate+(p.reference.inferredFrom?' · data aproximada':'')))+'</small></p>').join('')+'</div><button type="button" data-apply>Gravar '+ready.length+' referências</button><button type="button" data-close>Cancelar</button><p role="status"></p>';
        document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();
        dialog.querySelector('[data-apply]').disabled=!ready.length;
        dialog.querySelector('[data-apply]').onclick=()=>{
          try {
            let next=Finance.validateState(WalletStore.finance());
            for(const p of ready){const entry=next.entries.find(e=>e.id===p.id);if(!entry||JSON.stringify(entry)!==p.baseline)throw new Error('Um lançamento mudou. Cancele e confira a prévia novamente.');next=F.update(next,{type:'edit',id:p.id,patch:{cadReference:{...p.reference,recordedAt:new Date().toISOString()}}});}
            FinanceUI.save(next);dialog.close();
          }catch(error){dialog.querySelector('[role=status]').textContent=error.message;}
        };
      }catch(error){AppDialog.alert(error.message);}finally{button.disabled=false;button.textContent='Preparar câmbio histórico';}
    };
  });
  return {label,totalLabel,prepare,dateFor,original};
})();
