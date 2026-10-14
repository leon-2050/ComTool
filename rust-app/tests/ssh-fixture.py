"""Loopback SSH server for actual Rust interoperability; generated keys stay in test output."""
import json, socket, sys, threading, time
from pathlib import Path
import paramiko
from cryptography.hazmat.primitives import serialization

root=Path(sys.argv[1]); root.mkdir(parents=True,exist_ok=True)
host=paramiko.RSAKey.generate(2048); client=paramiko.RSAKey.generate(2048)
rotated=paramiko.RSAKey.generate(2048)
client.write_private_key_file(str(root/'client.pem'))
(root/'encrypted.pem').write_bytes(client.key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.OpenSSH,serialization.BestAvailableEncryption(b'fixture-passphrase')))
log_lock=threading.Lock()
def log(**record):
    with log_lock:
        with (root/'ssh-events.jsonl').open('a',encoding='utf-8') as file:file.write(json.dumps(record)+'\n')
class Server(paramiko.ServerInterface):
    def __init__(self,reject):self.shell=threading.Event();self.reject=reject
    def get_allowed_auths(self,username):return 'password,publickey'
    def check_auth_password(self,username,password):
        ok=username=='probe' and password=='fixture-password';log(auth='password',ok=ok);return paramiko.AUTH_SUCCESSFUL if ok else paramiko.AUTH_FAILED
    def check_auth_publickey(self,username,key):
        ok=username=='probe' and key==client;log(auth='publickey',ok=ok);return paramiko.AUTH_SUCCESSFUL if ok else paramiko.AUTH_FAILED
    def check_channel_request(self,kind,chanid):return paramiko.OPEN_SUCCEEDED if kind=='session' else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED
    def check_channel_pty_request(self,channel,term,width,height,*args):
        log(pty=term.decode(),cols=width,rows=height,rejected=self.reject);return not self.reject
    def check_channel_shell_request(self,channel):self.shell.set();return True
    def check_channel_window_change_request(self,channel,width,height,*args):log(resize=[width,height]);return True
def serve(sock,key,reject):
    transport=paramiko.Transport(sock)
    try:
        transport.add_server_key(key);server=Server(reject);transport.start_server(server=server);channel=transport.accept(15)
        if not channel or not server.shell.wait(10):return
        payload='\x1b[31mred\x1b[0m \x1b[38;5;208m256\x1b[0m \x1b[38;2;50;180;230mRGB\x1b[0m 中文\r\n'.encode()
        for chunk in [payload[:-5],payload[-5:-4],payload[-4:]]:channel.sendall(chunk)
        while transport.is_active():
            data=channel.recv(65536)
            if not data:break
            channel.sendall(data)
    except Exception as error:log(error=str(error))
    finally:transport.close()
listeners=[]
for key,reject in [(host,False),(host,True),(paramiko.RSAKey.generate(2048),False)]:
    listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen(16);listeners.append(listener)
    def accept(listener=listener,key=key,reject=reject):
        while True:
            try:sock,_=listener.accept()
            except OSError:return
            selected=rotated if key==host and not reject and (root/'rotate-host').exists() else key
            threading.Thread(target=serve,args=(sock,selected,reject),daemon=True).start()
    threading.Thread(target=accept,daemon=True).start()
(root/'ssh-ready.json').write_text(json.dumps({'port':listeners[0].getsockname()[1],'rejectPort':listeners[1].getsockname()[1],'changedPort':listeners[2].getsockname()[1]}))
try:
    while True:time.sleep(1)
except KeyboardInterrupt:pass
