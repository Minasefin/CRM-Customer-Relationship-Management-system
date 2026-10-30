'use strict';
const SQLite = require('better-sqlite3-multiple-ciphers');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const fail = (message) => { const e = new Error(message); e.userMessage = message; throw e; };
const str = (v = '', max = 10000) => {
  if (typeof v !== 'string' || v.length > max) fail('Invalid text field.');
  return v;
};
const obj = v => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail('Expected an object.'); return v; };
const arr = v => { if (!Array.isArray(v) || v.length > 1000) fail('Invalid list.'); return v; };
const flag = v => { if (typeof v !== 'boolean') fail('Expected true or false.'); return +v; };
const date = v => {
  if (v == null) return null;
  str(v, 40);
  if (!Number.isFinite(Date.parse(v))) fail('Invalid date.');
  return new Date(v).toISOString();
};
const image = v => {
  if (v == null) return null;
  str(v, 5 * 1024 * 1024);
  if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) fail('Invalid image.');
  return v;
};
const now = () => new Date().toISOString();
const platforms = ['x', 'instagram', 'snapchat', 'facebook'];
const mappings = {
  organizations: { created_at: 'createdAt' },
  contacts: { org_id:'orgId', first_name:'firstName', last_name:'lastName', created_at:'createdAt' },
  contracts: { contact_id:'contactId', org_id:'orgId', start_date:'start', end_date:'end' },
  employment_history: { contact_id:'contactId', org_id:'orgId', start_date:'start', end_date:'end' },
};
function shape(table, row) {
  if (!row) fail('Record not found.');
  return Object.fromEntries(Object.entries(row).map(([k,v]) => [mappings[table]?.[k] || k, k === 'archived' ? !!v : v]));
}

// Factory permits isolated test databases; production uses the singleton below.
function createDatabase(filename) {
  let db;
  const ready = () => { if (!db) fail('Database is locked.'); return db; };
  const run = (sql, ...args) => ready().prepare(sql).run(...args);
  const rows = (sql, ...args) => ready().prepare(sql).all(...args);
  const one = (table, id) => shape(table, ready().prepare('SELECT * FROM '+table+' WHERE id=?').get(str(id,100)));
  // Table/column names below are exclusively internal constants, never renderer input.
  const put = (table, data, id) => {
    const keys = Object.keys(data);
    if (id) run('UPDATE '+table+' SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?', ...Object.values(data), id);
    else run('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')', ...Object.values(data));
  };
  const transaction = fn => ready().transaction(fn)();
  const org = id => { if (id !== null) { const o=one('organizations',id); if(o.archived) fail('Restore the organization before assigning records.'); } return id; };
  const contact = id => {
    const c = one('contacts',id);
    c.phones=rows('SELECT label,number FROM contact_phones WHERE contact_id=? ORDER BY position',id);
    c.emails=rows('SELECT label,address FROM contact_emails WHERE contact_id=? ORDER BY position',id);
    c.children=rows('SELECT name FROM children WHERE contact_id=? ORDER BY position',id).map(x=>x.name);
    c.skills=rows('SELECT skill FROM skills WHERE contact_id=? ORDER BY position',id).map(x=>x.skill);
    c.social=Object.fromEntries(platforms.map(p=>[p,'']));
    for(const s of rows('SELECT platform,handle FROM social_accounts WHERE contact_id=?',id)) c.social[s.platform]=s.handle;
    c.notes=rows('SELECT id,at,text FROM notes WHERE contact_id=? ORDER BY at,id',id);
    return c;
  };
  function details(id,d) {
    const lists = [
      ['phones','contact_phones',x=>({label:str(obj(x).label,20),number:str(x.number,100)})],
      ['emails','contact_emails',x=>({label:str(obj(x).label,20),address:str(x.address,320)})],
      ['children','children',x=>({name:str(x,200)})],
      ['skills','skills',x=>({skill:str(x,200).trim()})],
    ];
    for(const [field,table,convert] of lists) if(d[field]!==undefined) {
      const values=arr(d[field]).map(convert);
      run('DELETE FROM '+table+' WHERE contact_id=?',id);
      values.forEach((v,position)=>put(table,{contact_id:id,position,...v}));
    }
    if(d.social!==undefined) {
      obj(d.social);
      run('DELETE FROM social_accounts WHERE contact_id=?',id);
      for(const platform of platforms) put('social_accounts',{contact_id:id,platform,handle:str(d.social[platform]??'',200)});
    }
  }
  const contactFields = d => ({first_name:str(d.firstName,200),last_name:str(d.lastName,200),title:str(d.title,200),address:str(d.address),spouse:str(d.spouse,200),photo:image(d.photo)});
  const organizationFields = d => ({name:str(d.name,200),city:str(d.city,200),country:str(d.country,200),logo:image(d.logo)});
  function contractFields(d) {
    one('contacts',d.contactId);
    if(d.orgId!==null) one('organizations',d.orgId);
    if(d.value!==null && (!Number.isSafeInteger(d.value)||d.value<0)) fail('Value must be whole nonnegative USD or unknown.');
    return {contact_id:d.contactId,org_id:d.orgId,title:str(d.title,200),location:str(d.location,500),value:d.value,status:str(d.status,20),start_date:date(d.start),end_date:date(d.end),notes:str(d.notes)};
  }
  const api = {
    openDatabase(key) {
      if(db) fail('Database is already open.');
      if(!Buffer.isBuffer(key)||key.length!==32) fail('A 32-byte key is required.');
      const file=typeof filename==='function'?filename():filename;
      fs.mkdirSync(path.dirname(file),{recursive:true});
      let candidate;
      try {
        candidate=new SQLite(file);
        candidate.key(key);
        candidate.prepare('SELECT count(*) FROM sqlite_master').get();
        candidate.pragma('foreign_keys=ON');
        candidate.pragma('secure_delete=ON');
        candidate.pragma('temp_store=MEMORY');
        const version=candidate.pragma('user_version',{simple:true});
        if(version===0) {
          if(candidate.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n) fail('Unversioned database requires migration.');
          candidate.transaction(()=>candidate.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8')))();
        } else if(version!==1) fail('Unsupported database version.');
        db=candidate;
        return {ok:true};
      } catch { candidate?.close(); fail('Unable to open database. Check the key and database version.'); }
    },
    closeDatabase() { if(db) db.close(); db=undefined; return {ok:true}; },
    isOpen:()=>!!db,
    rekeyDatabase(key) {
      if(!Buffer.isBuffer(key)||key.length!==32) fail('A 32-byte key is required.');
      ready().rekey(key); return {ok:true};
    },
    getOrganizations:()=>rows('SELECT * FROM organizations ORDER BY created_at,id').map(r=>shape('organizations',r)),
    getOrganization:id=>one('organizations',id),
    createOrganization(d) { obj(d); const id=randomUUID(); put('organizations',{id,...organizationFields(d),archived:0,created_at:now()}); return one('organizations',id); },
    updateOrganization(id,d) { obj(d); const old=one('organizations',id); put('organizations',organizationFields({...old,...d}),id); return one('organizations',id); },
    archiveOrganization(id,archived=true) { one('organizations',id); run('UPDATE organizations SET archived=? WHERE id=?',flag(archived),id); return one('organizations',id); },
    getContacts:()=>rows('SELECT id FROM contacts ORDER BY created_at,id').map(r=>contact(r.id)),
    getContact:contact,
    createContact(d) { obj(d); return transaction(()=>{
      const id=randomUUID(), at=now(), orgId=org(d.orgId??null);
      put('contacts',{id,org_id:orgId,...contactFields(d),status:'active',created_at:at});
      details(id,d);
      if(orgId) put('employment_history',{id:randomUUID(),contact_id:id,org_id:orgId,start_date:at,end_date:null});
      return contact(id);
    }); },
    updateContact(id,d) { obj(d); return transaction(()=>{const old=contact(id); put('contacts',contactFields({...old,...d}),id); details(id,d); return contact(id);}); },
    setContactStatus(id,status) { contact(id); run('UPDATE contacts SET status=? WHERE id=?',str(status,20),id); return contact(id); },
    moveContact(id,newOrgId) { return transaction(()=>{
      const c=contact(id); if(c.orgId===newOrgId) return c;
      org(newOrgId); const at=now();
      run('UPDATE employment_history SET end_date=? WHERE contact_id=? AND end_date IS NULL',at,id);
      if(newOrgId!==null) put('employment_history',{id:randomUUID(),contact_id:id,org_id:newOrgId,start_date:at,end_date:null});
      run('UPDATE contacts SET org_id=? WHERE id=?',newOrgId,id); return contact(id);
    }); },
    getEmploymentHistory(id) { contact(id); return rows('SELECT * FROM employment_history WHERE contact_id=? ORDER BY start_date,id',id).map(r=>shape('employment_history',r)); },
    getAllEmployment:()=>rows('SELECT * FROM employment_history ORDER BY start_date,id').map(r=>shape('employment_history',r)),
    addNote(id,text) { contact(id); text=str(text).trim(); if(!text) fail('Note cannot be empty.'); const n={id:randomUUID(),at:now(),text}; put('notes',{...n,contact_id:id}); return n; },
    updateNote(id,text) { return transaction(()=>{
      text=str(text).trim(); if(!text) fail('Note cannot be empty.');
      const n=one('notes',id);
      if(n.text!==text) { put('note_revisions',{id:randomUUID(),note_id:id,text:n.text,corrected_at:now()}); run('UPDATE notes SET text=? WHERE id=?',text,id); }
      return {id:n.id,at:n.at,text};
    }); },
    getContracts:()=>rows('SELECT * FROM contracts ORDER BY id').map(r=>shape('contracts',r)),
    createContract(d) { obj(d); const c=contact(d.contactId); const orgId=d.orgId===undefined?c.orgId:d.orgId;
      if(orgId!==c.orgId) fail('New contracts must use the contact current organization.');
      org(orgId); const id=randomUUID();
      put('contracts',{id,...contractFields({status:'active',value:null,notes:'',...d,orgId}),archived:0}); return one('contracts',id);
    },
    updateContract(id,d) { obj(d); const old=one('contracts',id);
      if((d.contactId!==undefined&&d.contactId!==old.contactId)||(d.orgId!==undefined&&d.orgId!==old.orgId)) fail('Contract associations cannot be changed.');
      put('contracts',contractFields({...old,...d}),id); return one('contracts',id);
    },
    archiveContract(id,archived=true) { one('contracts',id); run('UPDATE contracts SET archived=? WHERE id=?',flag(archived),id); return one('contracts',id); },
  };
  // UI-facing methods are async and sanitize SQLite errors before IPC logging.
  for(const name of Object.keys(api)) if(!['openDatabase','closeDatabase','isOpen','rekeyDatabase'].includes(name)) {
    const fn=api[name];
    api[name]=async(...args)=>{try{return fn(...args);}catch(e){if(e.userMessage) throw e; fail('Database operation failed. Check the supplied fields.');}};
  }
  return api;
}
const singleton=createDatabase(()=>path.join(require('electron').app.getPath('userData'),'crm.db'));
module.exports={...singleton,createDatabase};
