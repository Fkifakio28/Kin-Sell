#!/bin/bash
# Patch Nginx config to add no-cache for sw.js and index.html
# Insert before "location /assets/"

CONF="/etc/nginx/sites-enabled/kin-sell.conf"
BACKUP="${CONF}.bak-cache-patch"

cp "$CONF" "$BACKUP"

# Use python3 for reliable text replacement
python3 -c "
import re
with open('$CONF', 'r') as f:
    content = f.read()

patch = '''    # SW + HTML — never cache (force update on deploy)
    location = /sw.js {
        add_header Cache-Control \"no-cache, no-store, must-revalidate\";
        add_header Pragma \"no-cache\";
        expires 0;
    }
    location = /index.html {
        add_header Cache-Control \"no-cache, no-store, must-revalidate\";
        expires 0;
    }

'''

# Insert before 'location /assets/'
content = content.replace('    location /assets/', patch + '    location /assets/', 1)
with open('$CONF', 'w') as f:
    f.write(content)
print('PATCHED')
"

nginx -t 2>&1
if [ $? -eq 0 ]; then
    systemctl reload nginx
    echo "NGINX_RELOADED_OK"
else
    echo "NGINX_TEST_FAILED — restoring backup"
    cp "$BACKUP" "$CONF"
    nginx -t
fi
