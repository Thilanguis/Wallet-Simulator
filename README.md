# Findom Wallet

Aplicação única publicada em https://thilanguis.github.io/Wallet-Simulator/.
A carteira, notas reais, catálogo, tarefas, roleta e sessão são persistidos no
Firebase existente, projeto **walletsumilator**, documento **usuarios/gabriel-local**.

## Uso

Entre com Google usando uma das duas contas autorizadas. A aplicação recebe o
estado do servidor automaticamente. Não há código de vínculo nem botão de
conexão manual. O saldo do navegador nunca substitui o saldo do Firebase.

Um aparelho controla a sessão; o outro acompanha as alterações em tempo real.
Use **Liberar sessão** / **Assumir sessão** para trocar. O cronômetro pausa na
troca e não conta duas vezes. Sem conexão, novas operações ficam bloqueadas.

Na primeira conversão, o estado anterior do banco é preservado. As notas locais
anteriores são importadas automaticamente somente se o livro de notas do Firebase
ainda estiver vazio e aberto para essa migração. Abra a versão nova no mesmo
navegador/endereço que contém as notas e entre com Google; aguarde a confirmação
de envio. Notas já existentes no banco nunca são substituídas por uma cópia local.

## Desenvolvimento

Fonte ativa: Simulator/ dentro da pasta de trabalho do VS Code. Live Server em
http://127.0.0.1:5501 para desenvolvimento; o uso publicado não precisa dele.
Não há build ao salvar HTML, CSS ou JavaScript.

- npm ci
- npm run setup:local — prepara OCR local.
- npm test — modelo, cálculos, importação e sincronização.
- npm run test:live — Playwright com Live Server e perfis isolados.
- npm run test:rules — regras em emulador demo, exige Java 21.
- npm run build -- --public — pacote PWA em dist/, sem publicar.
- npm run test:e2e — testes do pacote de produção.

Os testes usam dados fictícios e transportes/emuladores isolados. Não fazem
operações de teste no banco real. Backups e administração privada ficam fora do
Git em .local-backups/ e .local/.

Leia docs/FIREBASE-LOCAL.md para detalhes da migração e das permissões.
