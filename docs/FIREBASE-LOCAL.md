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
local firebaseConfiguration.js continua ignorada e não entra no pacote público.

## Dois aparelhos e conexão

Somente um aparelho registra operações por vez, evitando duplicar sessão ou
sobrescrever transações. O outro recebe snapshots e pode consultar, navegar,
filtrar e exportar. Liberar sessão pausa e envia o cronômetro; Assumir sessão o
recebe pausado. Se um aparelho fecha sem liberar, a posse vence em até 45 segundos.

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
