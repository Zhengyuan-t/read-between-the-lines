'use strict';
$('feedback-open').onclick=()=>{resetHeld();closeLookup();$('feedback-status').textContent='若未配置邮件应用，可复制邮箱后自行发送。';$('feedback-dialog').showModal();};
$('feedback-close').onclick=()=>$('feedback-dialog').close();
$('feedback-copy').onclick=async()=>{try{await navigator.clipboard.writeText('RBL1018@outlook.com');$('feedback-status').textContent='邮箱已复制：RBL1018@outlook.com';}catch{$('feedback-status').textContent='请长按或选中上方邮箱手动复制：RBL1018@outlook.com';}};
