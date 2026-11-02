# Desenvolvimento local do Findom Wallet

A única aplicação ativa e o repositório Git estão em `D:\Sistemas DEV\dominação\Simulator`.

Abra Simulator no VS Code ou mantenha a pasta pai aberta. O Git detecta o repositório na subpasta. O Live Server aponta para Simulator em `http://127.0.0.1:5501`; o índice da pasta pai também encaminha para lá. As cópias antigas da raiz e a referência Firebase foram guardadas em `.local-backups/conciliacao-wallet-firebase-1793456267903/`, sem apagar arquivos ou dados do navegador.

Edite somente arquivos dentro de Simulator. Para preparar dependências: `npm ci` e `npm run setup:local`. Para publicar uma versão: `npm run build`, que cria dist/; publique esse conteúdo no seu servidor. Fazer push sem publicar o build não garante uma versão nova para usuários.

Alterar o catálogo em Configurações salva a configuração no navegador e no backup; com a carteira compartilhada conectada, ela também é sincronizada. Ao adicionar um objeto ao array services e salvar, a loja e o contrato reconhecem o item. Isso não altera os arquivos JavaScript no VS Code nem cria uma publicação. Para tornar valores padrão de uma versão, altere o catálogo no código e publique o build.

Para compartilhar o estado atual com o tablet, conecte primeiro o computador que contém a lista atual em **Configurações → Carteira compartilhada → Conectar ao Firebase existente**. A confirmação envia o Wallet atual e preserva o documento anterior. No segundo aparelho, abra a mesma versão por HTTPS e cole o código privado do primeiro. Não é necessário habilitar login Anônimo. Veja [FIREBASE-LOCAL.md](docs/FIREBASE-LOCAL.md) e a [comparação das versões](docs/COMPARACAO-VERSOES.md).

O PWA detecta uma nova versão publicada, pede confirmação e mostra o progresso de aplicação preservando os dados. O Live Server usa arquivos diretos e não espera o fluxo de atualização publicado.
