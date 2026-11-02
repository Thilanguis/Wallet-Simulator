# Firebase principal e login Google

## Fonte única

Projeto existente: walletsumilator. Documento: usuarios/gabriel-local.
A aplicação publicada é https://thilanguis.github.io/Wallet-Simulator/.
A versão de 02/11/2026 substitui a conexão opcional por código: entrar com Google
abre automaticamente o mesmo banco em ambos os aparelhos.

O estado completo usa walletAtualV4. Os campos saldoDominadora,
bonusEspecialAtivo, tarefasBloqueadas, accelBoosts e os campos do cronômetro/roleta
continuam disponíveis no documento existente. Alterações nesses campos pelo
console são recebidas pela tela. Não existe seleção de outro grupo/banco.

## Migração

A primeira transação lê o documento existente e as coleções tarefas, historico,
debugRoleta e accelBoosts. Nunca usa o saldo do navegador como base. Preserva o
estado original em config/antesFirebasePrincipalV4 antes de gravar a versão atual.
Não apaga documentos antigos, não reprecifica o histórico e não ressuscita tarefas
concluídas. Tarefas bloqueadas conservam seus prazos. O cronômetro conserva tempo,
valor e taxa, mas retorna pausado, sem inventar ganhos enquanto estava fechado.

Somente as configurações econômicas modernas são aproveitadas do navegador na
primeira conversão. As notas particulares anteriores são importadas uma única vez
quando o livro novo do Firebase ainda está vazio e financeImportOpen permite a
migração. IDs, ordem, moedas, equivalências e auditoria são preservados. Assim que
há notas no Firebase, a importação automática fica encerrada, inclusive depois de
uma exclusão intencional. Uma cópia antiga nunca repovoa silenciosamente o livro.

A importação exige abrir a atualização no navegador e no endereço que continham
as notas. O armazenamento de outro endereço não é acessível automaticamente.
As cópias anteriores continuam recuperáveis; nenhum cache é limpo pela migração.

Operações atuais espelham apenas registros alterados nas subcoleções existentes.
Concluir uma tarefa atualiza seu estado; arquivar histórico não apaga o documento.
Bônus, catálogo, notas e sessão são persistidos junto ao estado completo.
Resultados antigos da roleta são preservados, sem recriar prêmios já entregues.
O registro antigo de aceleração por multiplicador, sem orçamento de tempo, é
preservado sem inventar uma conversão para o redutor atual.

## Acesso

Google Authentication está habilitado no projeto existente. Duas contas verificadas
são autorizadas por config/acesso; os e-mails ficam apenas nesse documento privado
e na cópia administrativa local. Não devem ser inseridos em código público.
As regras negam leitura/gravação sem login ou por terceiros, impedem alterar a
lista pelo cliente e preservam os backups imutáveis. firestore.rules é a regra
principal; firestore.shared.rules pertence ao transporte antigo e não deve ser
publicado no lugar dela. firebase.json aponta para a regra principal.

js/firebase-web-config.js contém somente identificadores públicos do Web SDK.
Nenhum token administrativo ou credencial de conta é publicado. A configuração
local firebaseConfiguration.js é preservada, mas não é carregada pela aplicação
atual e não entra no pacote público.

## Dois aparelhos e conexão

Os dois logins autorizados recebem e alteram a mesma carteira, sem assumir ou
liberar sessão. Não existem carteiras separadas por UID. Uma transação combina
inclusões e alterações independentes, aplica a diferença de saldo sobre o valor
atual do servidor e preserva os IDs. Compras concorrentes não podem exceder o
saldo disponível nem reutilizar um cooldown. Edições incompatíveis do mesmo item
preservam uma cópia para conferência em vez de sobrescrever o registro.

O cronômetro possui uma única contagem compartilhada. Um gravador interno integra
o tempo, enquanto ambos podem registrar atividades e operar a carteira. Pausar,
retomar ou calcular em outro aparelho transfere essa função automaticamente,
sem botões de sessão. Os checkpoints evitam contar o mesmo tempo duas vezes.
O cache local não bloqueia outras abas: o Firebase decide as transações.

O desenho do cronômetro e do acelerador avança no aparelho, sem uma gravação no
Firebase a cada segundo ou quadro. O progresso pendente é enviado em checkpoints
de 15 segundos; compras, ganhos, início/pausa/conclusão, novos efeitos e alterações
do catálogo solicitam envio imediato. Sem alterações pendentes, o agendamento
interno não executa transações no banco. Cada checkpoint grava o documento
principal e somente os espelhos de registros alterados; os listeners também podem
gerar leituras. Isso reduz a frequência, mas não torna o uso do Firestore gratuito.

Os prazos do acelerador são conciliados pelo horário e orçamento já aplicado,
inclusive entre aparelhos com checkpoints diferentes. O mesmo trecho de tempo
nunca é uma segunda redução. Ao fechar o aparelho que conta a sessão, ela é
pausada e o envio final é solicitado; o último checkpoint continua sendo a base
segura se o navegador encerrar antes de concluir a rede. Ao reabrir, não são
inventados créditos por tempo fechado.

O catálogo JSON salvo em Configurações é parte de walletAtualV4.simulator:
economy, economyCatalog e economyCatalogBaseline. Alterar o catálogo no site não
reescreve arquivos JavaScript no computador. As cópias anteriores do navegador
podem ser baixadas em Configurações; recuperar somente os valores desejados no
editor evita restaurar saldo e histórico antigos sobre a carteira atual.

A tela só mostra a carteira após confirmação do servidor. Falhas de conexão
pausam a sessão e bloqueiam gravações até reconectar; não há uma carteira offline
paralela. Cache local e cópias anteriores servem para recuperação, nunca para
substituir automaticamente saldo, bônus ou histórico do banco.

## Validação e administração

npm test cobre o modelo de migração/sincronização. npm run test:live e
npm run test:e2e usam transportes e contas fictícias. npm run test:rules usa
somente o projeto demo-findom-rules no emulador, nunca o banco real.
A lista de acesso é administrada por IAM fora do cliente. A ativação de Google,
as regras e o bloqueio de leitura pública foram conferidos no projeto real.
O login interativo deve ser feito pelo titular da conta no botão Entrar com Google.
