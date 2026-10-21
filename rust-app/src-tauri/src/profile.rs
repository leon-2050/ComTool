// ComTool Rust rewrite, 2026-10-13; LGPL-3.0-only. Upstream: Neutree/COMTool.
use crate::model::*;
use serde_json::Value;
use std::{fs, path::{Path,PathBuf}};

pub fn directory() -> PathBuf {
    if let Some(path)=std::env::var_os("COMTOOL_RUST_PROFILE") { return PathBuf::from(path); }
    PathBuf::from(std::env::var_os("APPDATA").or_else(||std::env::var_os("HOME")).unwrap_or_else(||".".into())).join("ComToolRust")
}
pub fn load(dir: &Path) -> Result<Profile,String> {
    fs::create_dir_all(dir).map_err(|e|e.to_string())?;
    let p=dir.join("config.json"); if !p.exists() { return Ok(Profile::default()); }
    let profile: Profile=serde_json::from_slice(&fs::read(p).map_err(|e|e.to_string())?).map_err(|e|format!("配置无法读取，原文件已保留：{e}"))?;
    if profile.version!=1 { return Err("不支持的 Rust 配置版本，原文件已保留".into()); }
    Ok(profile)
}
pub fn save(dir: &Path, profile: &Profile) -> Result<(),String> {
    fs::create_dir_all(dir).map_err(|e|e.to_string())?;
    let temp=dir.join("config.json.tmp");
    let bytes=serde_json::to_vec_pretty(profile).map_err(|e|e.to_string())?;
    let mut file=std::fs::File::create(&temp).map_err(|e|e.to_string())?;
    use std::io::Write; file.write_all(&bytes).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;
    fs::rename(temp,dir.join("config.json")).map_err(|e|e.to_string())
}
pub fn legacy_path() -> PathBuf {
    PathBuf::from(std::env::var_os("APPDATA").unwrap_or_else(||".".into())).join("COMTool/config.json")
}
pub fn credential(id: &str) -> Result<keyring::Entry,String> {
    keyring::Entry::new("io.github.leon2050.ComToolRust",id).map_err(|e|e.to_string())
}
pub fn get_secrets(id: &str) -> Result<Secrets,String> {
    match credential(id)?.get_password() {
        Ok(s)=>serde_json::from_str(&s).map_err(|e|e.to_string()),
        Err(keyring::Error::NoEntry)=>Ok(Secrets::default()), Err(e)=>Err(format!("系统凭据读取失败：{e}"))
    }
}
pub fn put_secrets(id: &str, secret: &Secrets) -> Result<(),String> {
    credential(id)?.set_password(&serde_json::to_string(secret).map_err(|e|e.to_string())?).map_err(|e|format!("系统凭据保存失败：{e}"))
}
pub fn forget_secret(id: &str) -> Result<(),String> {
    match credential(id)?.delete_credential() { Ok(())|Err(keyring::Error::NoEntry)=>Ok(()),Err(e)=>Err(e.to_string()) }
}

#[derive(serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct ImportReport { pub profile: Profile, pub skipped: Vec<String>, pub warnings: Vec<String>, pub backup: String }
fn s(value:&Value,key:&str,default:&str)->String { value.get(key).and_then(Value::as_str).unwrap_or(default).to_string() }
fn b(value:&Value,key:&str,default:bool)->bool { value.get(key).and_then(Value::as_bool).unwrap_or(default) }
fn n(value:&Value,key:&str,default:u64)->u64 { value.get(key).and_then(Value::as_u64).unwrap_or(default) }
pub fn convert_legacy(value:&Value)->Result<ImportReport,String> {
    if value.get("version").and_then(Value::as_u64)!=Some(3) { return Err("目前支持旧版 version=3 配置".into()); }
    let mut p=Profile { theme:s(value,"skin","light"),sessions:vec![],import_dismissed:true,..Profile::default() };
    let mut skipped=vec![]; let mut warnings=vec![];
    let items=value.get("items").and_then(Value::as_array).ok_or("旧配置缺少会话列表")?;
    for item in items {
        let plugin=s(item,"pluginId","dbg"); let name=s(item,"name","会话");
        if !["dbg","terminal"].contains(&plugin.as_str()) { skipped.push(name); continue; }
        let root=&item["config"]; let conns=&root["conns"]; let conn=s(conns,"currConn","serial"); let c=&conns[&conn]; let options=&root["plugin"];
        let mut session=SessionConfig { name,view:if plugin=="terminal" {"terminal".into()}else{"receive".into()},encoding:s(value,"encoding","UTF-8"),..SessionConfig::default() };
        match conn.as_str() {
            "serial"=> {session.device=s(c,"port","");session.baud=n(c,"baudrate",115200) as u32;session.data_bits=n(c,"bytesize",8) as u8;session.parity=s(c,"parity","none").to_lowercase();session.stop_bits=s(c,"stopbits","1");session.flow=match s(c,"flowcontrol","None").as_str(){"XON/XOFF"=>"software","RTS/CTS"=>"hardware","DSR/DTR"=>"dsrdtr",_=>"none"}.into();session.rts=b(c,"rts",false);session.dtr=b(c,"dtr",false);},
            "tcp_udp"=> {session.kind=s(c,"protocol","tcp");session.server=s(c,"mode","client")=="server";session.bind_port=n(c,"port",2345) as u16;
                if let Some(target)=c["target"][0].as_str() { if let Some((host,port))=target.rsplit_once(':') { session.host=host.trim_matches(['[',']']).into();session.port=port.parse().unwrap_or(2345); } }
                session.reconnect=b(c,"auto_reconnect",false);session.reconnect_interval=(c["auto_reconnect_interval"].as_f64().unwrap_or(1.0)*1000.0) as u64;
            },
            "ssh"=> {session.kind="ssh".into();session.host=s(c,"host","127.0.0.1");session.port=n(c,"port",22) as u16;session.user=s(c,"user","");session.key_file=s(c,"ssh_key","");session.reconnect=b(c,"auto_reconnect",false); if !s(c,"passwd","").is_empty() { warnings.push(format!("{}：已保存的密码未导入，请重新输入",session.name)); }},
            _=> { skipped.push(session.name);continue; }
        }
        session.send_hex=!b(options,"sendAscii",true);session.receive_hex=!b(options,"receiveAscii",true);session.escape=b(options,"sendEscape",false);
        session.newline=if b(options,"sendAutoNewline",false) {if b(options,"useCRLF",true){"crlf"}else{"lf"}}else{"none"}.into();
        session.timestamp=b(options,"showTimestamp",false);session.font_size=(n(options,"fontSize",10)*4/3).clamp(8,32) as u16;session.keyword_highlighting=b(options,"keywordHighlighting",true);
        session.record_send=b(options,"recordSend",false);
        session.history=options["sendHistoryList"].as_array().map(|a|a.iter().filter_map(|v|v.as_str().map(str::to_string)).collect()).unwrap_or_default();
        session.presets=options["customSendItems"].as_array().map(|a|a.iter().filter_map(|v|v.as_str().or_else(||v.get("text").and_then(Value::as_str)).map(str::to_string)).collect()).unwrap_or_default();
        if s(value,"activeItem","")==s(item,"name","") {p.active_id=session.id.clone();}
        p.sessions.push(session);
    }
    if p.sessions.is_empty() {p.sessions.push(SessionConfig::default());}
    if !p.sessions.iter().any(|s|s.id==p.active_id) {p.active_id=p.sessions[0].id.clone();}
    Ok(ImportReport{profile:p,skipped,warnings,backup:String::new()})
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn migration_preserves_settings_but_not_secrets() {
        let input=serde_json::json!({"version":3,"skin":"dark","encoding":"GBK","items":[{"name":"终端","pluginId":"terminal","config":{"conns":{"currConn":"ssh","ssh":{"host":"127.0.0.1","port":22,"user":"test","passwd":"private"}},"plugin":{"fontSize":12}}},{"name":"图表","pluginId":"graph"}]});
        let r=convert_legacy(&input).unwrap();assert_eq!(r.profile.theme,"dark");assert_eq!(r.profile.sessions[0].kind,"ssh");assert_eq!(r.profile.sessions[0].font_size,16);assert_eq!(r.skipped,vec!["图表"]);assert!(!serde_json::to_string(&r.profile).unwrap().contains("private"));
    }
}
