// Reading and downloads work without JavaScript. Clipboard is an optional shortcut.
document.querySelectorAll<HTMLButtonElement>('[data-copy-target]').forEach(button=>{
  const target=document.getElementById(button.dataset.copyTarget || '');
  const status=button.parentElement?.querySelector<HTMLElement>('.copy-feedback');
  if (!target || !status || !navigator.clipboard) return;
  button.hidden=false;
  button.addEventListener('click',async()=>{
    try { await navigator.clipboard.writeText(target.textContent || ''); status.textContent='Copied. Adapt the brief to your own task and tools.'; }
    catch { status.textContent='Copy is unavailable. Select the text above or download the worksheet.'; }
  });
});
