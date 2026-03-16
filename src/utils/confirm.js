/** Show a confirm dialog (returns Promise<boolean>) */
export function showConfirm(msg, danger) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmMsg').textContent = msg;
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');
    yesBtn.className = 'btn-ok' + (danger ? ' danger' : '');
    noBtn.style.display = '';
    modal.style.display = 'flex';
    function cleanup() { modal.style.display = 'none'; yesBtn.onclick = null; noBtn.onclick = null; }
    yesBtn.onclick = () => { cleanup(); resolve(true); };
    noBtn.onclick = () => { cleanup(); resolve(false); };
  });
}

/** Show an alert dialog (returns Promise<void>) */
export function showAlert(msg) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmMsg').textContent = msg;
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');
    yesBtn.className = 'btn-ok';
    noBtn.style.display = 'none';
    modal.style.display = 'flex';
    yesBtn.onclick = () => { modal.style.display = 'none'; yesBtn.onclick = null; resolve(); };
  });
}
