#!/usr/bin/env python3
"""Builds dist/index.html (standalone, open anywhere) and dist/artifact.html (body-only, for claude.ai artifacts)."""
import pathlib
root = pathlib.Path(__file__).parent
src = root / 'src'
read = lambda n: (src / n).read_text(encoding='utf-8')

fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&family=Nunito:wght@600;700;800&display=swap">'
meta = ('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">'
        '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="TimeSpent">'
        '<meta name="theme-color" content="#EFE2C6">')
icon = '<link rel="apple-touch-icon" href="data:image/svg+xml,' + (
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23F6C445'/%3E"
    "%3Ccircle cx='50' cy='50' r='34' fill='%23FFF8EA' stroke='%2333241A' stroke-width='4'/%3E"
    "%3Cline x1='50' y1='50' x2='50' y2='28' stroke='%2333241A' stroke-width='6' stroke-linecap='round'/%3E"
    "%3Cline x1='50' y1='50' x2='68' y2='58' stroke='%23E4526E' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E") + '">'

style = '<style>\n' + read('styles.css') + '\n</style>'
scripts = '<script>\n' + read('i18n.js') + '\n' + read('engine.js') + '\n' + read('ui.js') + '\n</script>'
markup = read('markup.html')

standalone = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>TimeSpent</title>
{meta}
{icon}
{fonts}
{style}
</head>
<body>
{markup}
{scripts}
</body>
</html>
"""
artifact = f"""<title>TimeSpent</title>
{meta}
{fonts}
{style}
{markup}
{scripts}
"""
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'index.html').write_text(standalone, encoding='utf-8')
(root / 'dist' / 'artifact.html').write_text(artifact, encoding='utf-8')
print('standalone: %d KB, artifact: %d KB' % (len(standalone.encode()) // 1024, len(artifact.encode()) // 1024))
