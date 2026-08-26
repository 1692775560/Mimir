# Mimir 官网部署

纯静态站，无构建步骤，`website/` 目录即为站点根目录。

线上地址：<https://mimir.smartlarkai.com>（服务器 39.107.80.207，Alibaba Cloud Linux 4）

## 部署（已完成的环境）

服务器上已就绪：nginx（`/etc/nginx/conf.d/mimir.conf`，80 端口 default_server）、站点文件在 `/var/www/mimir`。

日常更新只需在本地仓库根目录跑：

```sh
bash website/deploy.sh root@39.107.80.207
```

## 从零重建（Debian/Ubuntu 示例）

1. 域名解析：在阿里云域名控制台给 `mimir.smartlarkai.com` 加 A 记录，指向 `39.107.80.207`。
2. 服务器准备（Alibaba Cloud Linux 用 `dnf`）：

   ```sh
   dnf install -y nginx rsync
   mkdir -p /var/www/mimir
   cp website/nginx.conf /etc/nginx/conf.d/mimir.conf
   nginx -t && systemctl enable --now nginx
   ```

3. 本地推送站点：`bash website/deploy.sh root@39.107.80.207`
4. HTTPS：服务器上用 acme.sh 签发（`~/.acme.sh/acme.sh --issue -d mimir.smartlarkai.com -w /var/www/mimir`），已配自动续期 cron

## 注意：ICP 备案

服务器在**中国大陆**且要用 80/443 端口对外提供 HTTP 服务，域名必须先完成 ICP 备案。未备案时 80/443 会被机房拦截。
