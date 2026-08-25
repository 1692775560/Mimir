# Mimir 官网部署

纯静态站，无构建步骤，`website/` 目录即为站点根目录。

## 部署到阿里云

1. 域名解析：在阿里云域名控制台加一条 A 记录，指向服务器公网 IP。
2. 服务器准备（Ubuntu/Debian）：

   ```sh
   apt install -y nginx rsync
   mkdir -p /var/www/mimir
   cp website/nginx.conf /etc/nginx/sites-available/mimir   # 先改里面的域名
   ln -s /etc/nginx/sites-available/mimir /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```

3. 本地推送站点：

   ```sh
   bash website/deploy.sh root@<服务器IP>
   ```

4. HTTPS（DNS 生效后）：`apt install -y certbot python3-certbot-nginx && certbot --nginx -d your-domain.com`

## 注意：ICP 备案

服务器在**中国大陆**且要用 80/443 端口对外提供 HTTP 服务，域名必须先完成 ICP 备案（阿里云控制台可免费提交，审核约 1–3 周）。未备案时 80/443 会被机房拦截。备案完成前可先用 IP + 非标端口内部预览。
