// Share the classic challenge's preference, default, labels and browser tint.
function paintTheme() {
  const dark=document.documentElement.dataset.theme==='dark';
  const label=dark?'切换浅色模式':'切换暗色模式';
  document.querySelector('meta[name="theme-color"]').content=dark?'#0a0d1c':'#f6f8fd';
  const button=document.getElementById('themeBtn');
  button.innerHTML=`${dark?'☀️':'🌙'}<span class="theme-label">${dark?'浅色':'暗色'}</span>`;
  button.title=label;button.setAttribute('aria-label',label);
  button.setAttribute('aria-pressed',String(dark));
}
document.getElementById('themeBtn').addEventListener('click',()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next;
  try{localStorage.setItem('vc_theme',next);}catch{}
  paintTheme();
});
window.addEventListener('storage',event=>{
  if(event.key==='vc_theme'){document.documentElement.dataset.theme=event.newValue==='dark'?'dark':'light';paintTheme();}
});
paintTheme();
