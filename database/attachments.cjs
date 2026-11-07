'use strict';
const MAX_ATTACHMENT_BYTES=10*1024*1024;
const TYPES={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.txt':'text/plain','.csv':'text/csv','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
function validateAttachment(value) {
  const fail=()=>{throw Object.assign(new Error('Choose a supported file of 1 byte to 10 MiB with a simple filename and valid base64 content.'),{userMessage:'Choose a supported file of 1 byte to 10 MiB with a simple filename and valid base64 content.'});};
  const {name,dataBase64,mimeType}=value;
  if(typeof name!=='string'||!name.trim()||name.length>255||/[\\/:*?"<>|\x00-\x1f\x7f]/.test(name)||/[. ]$/.test(name)) fail();
  const ext=require('node:path').extname(name).toLowerCase();
  if(!Object.hasOwn(TYPES,ext)||mimeType!==TYPES[ext]) fail();
  if(typeof dataBase64!=='string'||!dataBase64.length||dataBase64.length>4*Math.ceil(MAX_ATTACHMENT_BYTES/3)||dataBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) fail();
  const bytes=Buffer.from(dataBase64,'base64');
  if(!bytes.length||bytes.length>MAX_ATTACHMENT_BYTES||bytes.toString('base64')!==dataBase64) fail();
  // Content stays inert inside the encrypted DB. No automatic execution or export.
  return {name,mimeType,bytes};
}
module.exports={MAX_ATTACHMENT_BYTES,TYPES,validateAttachment};
