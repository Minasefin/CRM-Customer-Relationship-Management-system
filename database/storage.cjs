'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const error=message=>Object.assign(new Error(message),{userMessage:message});
const FILES=['crm.db','auth.json'];
function pairExists(directory) {
  return FILES.every(name=>{try {const s=fs.lstatSync(path.join(directory,name));return s.isFile()&&!s.isSymbolicLink()&&s.size>0;}catch{return false;}});
}
function resolveStorage(defaultDirectory) {
  const pointer=path.join(defaultDirectory,'storage-location.json');
  if(!fs.existsSync(pointer)) return defaultDirectory;
  try {
    const value=JSON.parse(fs.readFileSync(pointer,'utf8'));
    if(value.version!==1||typeof value.directory!=='string'||!path.isAbsolute(value.directory)||!pairExists(value.directory)) throw new Error();
    return fs.realpathSync(value.directory);
  } catch {throw error('The selected data folder is unavailable or incomplete. Reconnect its drive before starting Auria. No new database has been created.');}
}
function digest(file) {
  const hash=createHash('sha256'), fd=fs.openSync(file,'r'), buffer=Buffer.alloc(1024*1024);
  try {let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0) hash.update(buffer.subarray(0,n));return hash.digest('hex');}
  finally {fs.closeSync(fd);}
}
// Caller must stop auth operations and close/checkpoint the database first.
// Source files are retained as a recovery copy, never removed automatically.
function relocateStorage(defaultDirectory,sourceDirectory,targetDirectory) {
  const copied=[];
  let pointerTemp;
  try {
    const source=fs.realpathSync(sourceDirectory), target=fs.realpathSync(targetDirectory);
    if(source===target||!fs.statSync(target).isDirectory()||fs.readdirSync(target).length) throw error('Choose an empty folder different from the current data folder.');
    if(!pairExists(source)) throw error('Both the database and login file must exist before moving storage.');
    for(const suffix of ['-wal','-shm','-journal']) {
      const sidecar=path.join(source,'crm.db'+suffix);
      if(fs.existsSync(sidecar)&&fs.statSync(sidecar).size) throw error('The database is still in use. Close other copies before moving it.');
    }
    for(const name of FILES) {
      const from=path.join(source,name), to=path.join(target,name);
      fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);copied.push(to);
      const fd=fs.openSync(to,'r+');try {fs.fsyncSync(fd);}finally {fs.closeSync(fd);}
      if(digest(from)!==digest(to)) throw error('The copied files could not be verified. The original data is unchanged.');
    }
    // Commit the pointer only after BOTH durable copies have been verified.
    const pointer=path.join(defaultDirectory,'storage-location.json');
    pointerTemp=pointer+'.'+randomUUID()+'.tmp';
    const fd=fs.openSync(pointerTemp,'wx',0o600);
    try {fs.writeFileSync(fd,JSON.stringify({version:1,directory:target}));fs.fsyncSync(fd);}finally {fs.closeSync(fd);}
    fs.renameSync(pointerTemp,pointer);
    return {ok:true,directory:target,restartRequired:true,originalRetained:true};
  } catch(e) {
    // Remove only files exclusively created by this attempt, never existing data.
    for(const file of copied) {try{fs.unlinkSync(file);}catch{}}
    if(pointerTemp) {try{fs.unlinkSync(pointerTemp);}catch{}}
    throw e.userMessage?e:error('Could not move storage. The original database and login files are unchanged.');
  }
}
module.exports={resolveStorage,relocateStorage};
