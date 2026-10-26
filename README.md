# HydroStats — versão de demonstração

Versão estática (só HTML, CSS e JS) do HydroStats, para conhecer o layout no GitHub Pages.
Não usa PHP, banco de dados nem API: login, cadastro e formulários são só visuais, nada é salvo,
e o painel mostra dados fictícios gerados no navegador (`assets/js/demo-data.js`).

## Publicar no GitHub Pages
1. Crie um repositório e envie o conteúdo desta pasta (o `index.html` fica na raiz).
2. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

Para testar localmente: `python -m http.server` dentro desta pasta e abra `http://localhost:8000`.
