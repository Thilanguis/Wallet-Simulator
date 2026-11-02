# Conexão Firebase existente — versão única

A fonte ativa é `D:\Sistemas DEV\dominação\Simulator`. O visual, a lista de
notas reais, o catálogo e as regras atuais são mantidos. A conexão recuperada do
[Wallet-Simulator](https://github.com/Thilanguis/Wallet-Simulator/tree/278fa677ebc3fad33e2841c92722f017701c8137)
usa o projeto `walletsumilator` e o documento `usuarios/gabriel-local`.

## Conectar a carteira atual

1. No computador que contém a lista atual, atualize `http://127.0.0.1:5501`.
2. Abra **Configurações → Carteira compartilhada → Conectar ao Firebase existente**.
3. Confira a confirmação: se o estado atual ainda não estiver no Firebase, este
   aparelho será a base. Saldo, histórico, tarefas, catálogo e notas atuais são
   enviados juntos. Aguarde **Sincronizado** antes de fechar a página.
4. Use **Mostrar código de vínculo → Copiar código**. No segundo aparelho, abra a
   mesma versão do Wallet, cole em **Código privado do outro aparelho** e pressione
   **Vincular este aparelho**. O código é necessário uma vez por navegador.
5. Guarde o código privadamente. Ele permite descriptografar a carteira e não faz
   parte do backup JSON comum. Apagar dados do navegador também apaga o vínculo.

**Não é necessário habilitar Anônimo nem criar conta ou fazer login Google nesse
fluxo.** Ele usa o acesso já configurado no projeto antigo. O arquivo local
`firebaseConfiguration.js` existente já aponta para o mesmo projeto e expõe
`window._firestoreDb`; não copie uma configuração de outro Firebase. Sem esse
arquivo, `js/firebase-connection.js` inicializa o mesmo banco usando apenas o ID
público do projeto. Isso permite publicar sem versionar a configuração local.
A conexão só começa ao conectar ou retomar um vínculo já salvo.

O primeiro vínculo conserva uma cópia local anterior e guarda o documento Firebase
antigo em `usuarios/gabriel-local/config/antesWalletAtualV3`, na mesma transação da
primeira gravação. As subcoleções antigas não são apagadas nem importadas. O segundo
aparelho recebe o Wallet atual; não soma seu saldo ou sua lista com a carteira
compartilhada. Uma chave errada não reinicializa nem sobrescreve a carteira.

## Privacidade e regras existentes

A leitura do documento antigo respondeu HTTP 200 sem login. Por isso, o novo
campo `walletAtualV3` guarda o estado completo **criptografado com AES-GCM**. A
chave fica somente nos aparelhos. A lista de gastos reais não é copiada em texto
legível para campos públicos ou para as subcoleções antigas.

Os campos básicos compatíveis — saldo interno, bônus, dados de roleta, bloqueios e
cronômetro — continuam sujeitos às permissões antigas do documento. Isso não torna
o banco inteiro privado; esconder o repositório GitHub não modifica essas regras.
Nenhuma permissão do Firebase foi alterada por esta integração.

Se a conexão informar falta de permissão, confira o acesso ao documento e ao backup
na subcoleção `config`. A aplicação não abre as regras automaticamente e não faz a
primeira gravação sem conseguir preservar o documento anterior.

`firestore.shared.rules` e `js/firebase-transport.js` pertencem ao transporte
alternativo criado antes de encontrar a versão correta. São mantidos para
compatibilidade com vínculos já configurados, mas **não precisam ser publicados nem
ativados para a conexão principal existente**. Novas conexões usam a versão única
com `firebase-existing-transport.js`.

## Uso entre aparelhos

- Um aparelho controla a sessão por vez; o outro acompanha as alterações e pode
  navegar, filtrar, ler notas/histórico e exportar backup.
- Para trocar, use **Liberar controle** no primeiro e **Assumir controle** no
  segundo. O cronômetro é pausado e enviado antes da troca. Use **Continuar** para
  retomá-lo; a sessão não é contada em dobro.
- Se o controlador fechar sem liberar, o controle vence em até 45 segundos.
  Registros são enviados prontamente; checkpoints do cronômetro e dos redutores
  são agrupados. Aguarde a indicação de sincronização antes de fechar.
- Se a conexão cair, a sessão é pausada e novas operações compartilhadas ficam
  bloqueadas. **Reconectar** recebe o estado confirmado; alterações não enviadas
  ficam preservadas para recuperação, sem sobrescrever o outro aparelho.
- Restaurar um backup no controlador substitui a carteira compartilhada após
  confirmação. A página aguarda o envio antes de recarregar.
- **Desconectar este aparelho** conserva os dados locais e não apaga o Firebase.
- Use uma aba por navegador: a proteção contra gravações de várias abas no mesmo
  armazenamento continua ativa.

## Campos do console e compatibilidade

O estado completo fica em `usuarios/gabriel-local.walletAtualV3`. Os campos básicos
originais continuam atualizados: `saldoDominadora`, `bonusEspecialAtivo`,
`roletaUltimoUso`, `roletaUltimoResultadoTexto`, `tarefasBloqueadas`, `accelBoosts`,
`timerTempoSegundos`, `timerValorAtual`, `timerValorPorMinuto` e `timerAtivo`.
`timerRodando` distingue uma sessão em andamento de uma sessão pausada.

Editar um saldo numérico ou o bônus booleano no console é refletido no Wallet.
Isso não reescreve o histórico nem as notas. O cronômetro preserva suas unidades
acumuladas e o combo; os campos de espelho não são créditos adicionais no saldo.
Para alterar catálogo, registros financeiros ou regras, use a interface atual.
Não edite o payload criptografado. Os documentos antigos de `tarefas`, `historico`
e `debugRoleta` são preservados como dados da versão anterior; a aplicação antiga
não deve ser usada para operar a carteira depois da atualização.

## Tablet e publicação

O tablet deve abrir a mesma versão publicada. Os dois repositórios possuem GitHub
Pages habilitado, e uma URL antiga pode continuar mostrando o aplicativo antigo.
O Live Server local não atualiza uma publicação do GitHub. Não limpe dados do
navegador para tentar corrigir a URL ou o cache.

`127.0.0.1:5501` no tablet aponta para o próprio tablet. Para outro aparelho, use a
publicação HTTPS correta ou um encaminhamento HTTPS privado do Live Server. O
contexto seguro é necessário para a criptografia nativa do navegador. O build
`npm run build` gera `dist/` e inclui a configuração Firebase local quando ela
existe, mas não publica. A inicialização pelo ID público funciona também quando
esse arquivo não está disponível na publicação.

## Limites e validação

O estado tem limite preventivo de aproximadamente 650 KB para respeitar o limite
de documento do Firestore após criptografia/base64. Se exceder, a aplicação mostra
o erro e conserva os registros locais; não trunca a lista. Continue exportando
backups JSON. Não foram habilitados serviços pagos de backup/PITR.

A validação usa perfis isolados e SDK simulado, sem enviar dados de teste ao projeto
real. As auditorias do documento real foram somente leituras, por REST e pelo SDK;
uma cópia privada está em `.local-backups/`. Nenhuma carteira real foi enviada
automaticamente: o primeiro envio depende da confirmação no navegador que contém
a lista atual. Veja [COMPARACAO-VERSOES.md](COMPARACAO-VERSOES.md) para o
mapa do que foi mantido e adaptado.

Referências oficiais: [snapshots](https://firebase.google.com/docs/firestore/query-data/listen)
e [transações](https://firebase.google.com/docs/firestore/manage-data/transactions).
