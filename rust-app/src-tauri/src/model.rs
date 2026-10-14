// ComTool Rust rewrite, 2026-10-13. Derived from Neutree/COMTool; LGPL-3.0-only.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SessionConfig {
    pub id: String, pub name: String, pub kind: String, pub view: String,
    pub host: String, pub port: u16, pub bind_host: String, pub bind_port: u16,
    pub server: bool, pub device: String, pub baud: u32, pub data_bits: u8,
    pub parity: String, pub stop_bits: String, pub flow: String, pub rts: bool, pub dtr: bool,
    pub user: String, pub key_file: String, pub remember_secret: bool,
    pub reconnect: bool, pub reconnect_interval: u64,
    pub encoding: String, pub send_hex: bool, pub receive_hex: bool, pub escape: bool,
    pub newline: String, pub timestamp: bool, pub font_size: u16,
    pub keyword_highlighting: bool, pub history: Vec<String>, pub presets: Vec<String>,
    pub log_path: String, pub record_send: bool,
}
impl Default for SessionConfig {
    fn default() -> Self { Self {
        id: uuid::Uuid::new_v4().to_string(), name: "收发".into(), kind: "serial".into(), view: "receive".into(),
        host: "127.0.0.1".into(), port: 2345, bind_host: "0.0.0.0".into(), bind_port: 2345,
        server: false, device: String::new(), baud: 115200, data_bits: 8, parity: "none".into(),
        stop_bits: "1".into(), flow: "none".into(), rts: false, dtr: false,
        user: String::new(), key_file: String::new(), remember_secret: false,
        reconnect: false, reconnect_interval: 1000, encoding: "UTF-8".into(), send_hex: false,
        receive_hex: false, escape: false, newline: "none".into(), timestamp: false,
        font_size: 14, keyword_highlighting: true, history: vec![], presets: vec![],
        log_path: String::new(), record_send: false,
    }}
}
impl SessionConfig {
    pub fn validate(&self) -> Result<(), String> {
        if !["serial", "tcp", "udp", "ssh"].contains(&self.kind.as_str()) { return Err("未知连接类型".into()); }
        if self.id.is_empty() || self.name.trim().is_empty() { return Err("会话 ID 和名称不能为空".into()); }
        if !(5..=8).contains(&self.data_bits) || self.baud == 0 { return Err("无效串口参数".into()); }
        if !["none", "odd", "even", "mark", "space"].contains(&self.parity.as_str()) || !["1", "1.5", "2"].contains(&self.stop_bits.as_str()) || !["none", "software", "hardware", "dsrdtr"].contains(&self.flow.as_str()) { return Err("无效串口校验、停止位或流控".into()); }
        if self.kind == "ssh" && (self.user.trim().is_empty() || self.port == 0) { return Err("SSH 用户和端口不能为空".into()); }
        if self.kind != "serial" && !self.server && self.port == 0 { return Err("目标端口必须大于零".into()); }
        if !(8..=32).contains(&self.font_size) { return Err("字号必须为 8–32".into()); }
        Ok(())
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Secrets { pub password: String, pub passphrase: String }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Profile { pub version: u32, pub theme: String, pub active_id: String, pub sessions: Vec<SessionConfig>, pub known_hosts: BTreeMap<String, String>, pub import_dismissed: bool }
impl Default for Profile { fn default() -> Self {
    let s = SessionConfig::default(); Self { version: 1, theme: "light".into(), active_id: s.id.clone(), sessions: vec![s], known_hosts: BTreeMap::new(), import_dismissed: false }
}}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatusEvent { pub session_id: String, pub generation: u64, pub state: String, pub message: String, pub peers: Vec<String>, pub rx: u64, pub tx: u64, pub dropped: u64 }
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DataFrame { pub session_id: String, pub generation:u64, pub peer_id: String, pub sequence: u64, pub bytes: Vec<u8>, pub datagram: bool, pub timestamp: String }
#[derive(Clone, Debug)]
pub struct Packet { pub peer: String, pub bytes: Vec<u8>, pub datagram: bool }
#[derive(Debug)]
pub enum Incoming { Data(Packet), Fence(tokio::sync::oneshot::Sender<()>) }
impl From<Packet> for Incoming {fn from(packet:Packet)->Self{Self::Data(packet)}}
#[derive(Debug)]
pub enum Control { Send { bytes: Vec<u8>, peer: Option<String>, token: Option<tokio_util::sync::CancellationToken> }, Resize { cols: u32, rows: u32 }, DisconnectPeer(String) }

pub fn encode_input(text: &str, config: &SessionConfig) -> Result<Vec<u8>, String> {
    let mut output = if config.send_hex {
        let clean: String = text.chars().filter(|c| !c.is_whitespace()).collect();
        if clean.len() % 2 != 0 || !clean.is_ascii() { return Err("HEX 必须为完整字节，例如 01 AF 32".into()); }
        (0..clean.len()).step_by(2).map(|i| u8::from_str_radix(&clean[i..i+2], 16).map_err(|_| "HEX 包含无效字符".to_string())).collect::<Result<Vec<_>,_>>()?
    } else {
        let mut out = Vec::new(); let mut plain = String::new(); let mut chars = text.chars().peekable();
        while let Some(c) = chars.next() {
            if config.escape && c == '\\' {
                out.extend(encode_text(&plain, &config.encoding)?); plain.clear();
                match chars.next() { Some('n') => out.push(10), Some('r') => out.push(13), Some('t') => out.push(9), Some('0') => out.push(0), Some('\\') => out.push(92), Some('x') => {
                    let h: String = [chars.next().ok_or("不完整的 \\x 转义")?, chars.next().ok_or("不完整的 \\x 转义")?].iter().collect();
                    out.push(u8::from_str_radix(&h,16).map_err(|_| "无效的 \\x 转义")?);
                }, _ => return Err("无效转义，请使用 \\n \\r \\t \\0 \\xNN 或 \\\\".into()) }
            } else { plain.push(c); }
        }
        out.extend(encode_text(&plain, &config.encoding)?); out
    };
    match config.newline.as_str() { "lf" => output.push(10), "crlf" => output.extend([13,10]), "cr" => output.push(13), _ => {} }
    Ok(output)
}
pub fn encode_text(text: &str, encoding: &str) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    if encoding.eq_ignore_ascii_case("GB18030")||encoding.eq_ignore_ascii_case("GB2312"){
        use windows_sys::Win32::Globalization::{WideCharToMultiByte,WC_NO_BEST_FIT_CHARS,WC_ERR_INVALID_CHARS};
        if text.is_empty(){return Ok(vec![]);}
        let full=encoding.eq_ignore_ascii_case("GB18030");let cp=if full{54936}else{20936};let flags=if full{WC_ERR_INVALID_CHARS}else{WC_NO_BEST_FIT_CHARS};
        let wide:Vec<u16>=text.encode_utf16().collect();let len=i32::try_from(wide.len()).map_err(|_|"输入过长")?;let mut used=0;
        let used_ptr=if full{std::ptr::null_mut()}else{&mut used};
        let count=unsafe{WideCharToMultiByte(cp,flags,wide.as_ptr(),len,std::ptr::null_mut(),0,std::ptr::null(),used_ptr)};
        if count==0{return Err(format!("编码失败：{}",std::io::Error::last_os_error()));}let mut bytes=vec![0;count as usize];
        let result=unsafe{WideCharToMultiByte(cp,flags,wide.as_ptr(),len,bytes.as_mut_ptr(),count,std::ptr::null(),used_ptr)};
        if result==0{return Err(format!("编码失败：{}",std::io::Error::last_os_error()));}if used!=0{return Err("部分字符不能使用所选编码发送".into());}return Ok(bytes);
    }
    match encoding.to_ascii_uppercase().as_str() {
        "UTF-8" => Ok(text.as_bytes().to_vec()),
        "ASCII" => if text.is_ascii() { Ok(text.as_bytes().to_vec()) } else { Err("ASCII 不能编码中文".into()) },
        "UTF-16" => Ok(text.encode_utf16().flat_map(u16::to_le_bytes).collect()),
        label => { let enc = encoding_rs::Encoding::for_label(label.as_bytes()).ok_or("不支持的编码")?;
            let (bytes,_,error) = enc.encode(text); if error { Err("部分字符不能使用所选编码发送".into()) } else { Ok(bytes.into_owned()) }
        }
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn exact_hex_and_escape() {
        let mut c = SessionConfig::default(); c.send_hex = true;
        assert_eq!(encode_input("00 ff 31", &c).unwrap(), vec![0,255,49]);
        assert!(encode_input("a", &c).is_err()); assert!(encode_input("中", &c).is_err());
        c.send_hex=false; c.escape=true; c.newline="crlf".into();
        assert_eq!(encode_input("中\\x00\\n", &c).unwrap(), ["中".as_bytes(), &[0,10,13,10]].concat());
    }
    #[test] fn profile_contains_no_password() {
        let value=serde_json::to_string(&Profile::default()).unwrap(); assert!(!value.contains("password")); assert!(!value.contains("passphrase"));
    }
    #[cfg(windows)]#[test]fn exact_chinese_encodings(){
        assert_eq!(encode_text("中文","GB2312").unwrap(),vec![0xd6,0xd0,0xce,0xc4]);
        assert!(encode_text("😀","GB2312").is_err());
        assert_eq!(encode_text("😀","GB18030").unwrap(),vec![0x94,0x39,0xfc,0x36]);
        assert_eq!(encode_text("a\0b","GB18030").unwrap(),vec![97,0,98]);
    }
}
