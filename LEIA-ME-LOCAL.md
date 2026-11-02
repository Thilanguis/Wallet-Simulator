# Projeto único

Use a fonte em D:\Sistemas DEV\dominação\Simulator. O remoto oficial é
Thilanguis/Wallet-Simulator e a publicação é
https://thilanguis.github.io/Wallet-Simulator/.

A aplicação usa Google Authentication e o Firebase existente automaticamente.
A pasta local é para editar/testar; não é uma carteira separada. A raiz preserva
cópias antigas, que não devem receber novas edições.

Para desenvolvimento, npm ci e npm run setup:local preparam as dependências.
Live Server em http://127.0.0.1:5501 usa arquivos diretos, sem build ou cache PWA.
Para produção, npm run build -- --public gera dist/; não publica sozinho.

Se as notas anteriores estão no navegador do Live Server, abra o mesmo endereço
na versão nova e entre com Google uma vez. A importação inicial conserva os IDs e
não altera o saldo do banco. Aguarde a confirmação de envio ao Firebase. O tablet
receberá as mesmas notas ao entrar com a outra conta autorizada.

Não limpe os dados do navegador para atualizar. Existe exportação da cópia anterior
em Configurações. Os backups locais permanecem em .local-backups/, fora do Git.
