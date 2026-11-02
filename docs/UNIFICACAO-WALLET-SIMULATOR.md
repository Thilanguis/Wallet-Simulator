# Unificação do Findom Wallet

O único destino de desenvolvimento/publicação é Thilanguis/Wallet-Simulator,
main, em https://thilanguis.github.io/Wallet-Simulator/. A pasta ativa do VS Code
permanece D:\Sistemas DEV\dominação\Simulator. Ambos os históricos Git foram
preservados; não há necessidade de outra cópia local do aplicativo.

## Correção da persistência — 02/11/2026

A primeira unificação publicou a interface moderna, mas manteve o Firebase como
conexão opcional. Isso não atendia ao pedido. A versão atual usa o Firebase existente
como fonte principal e autenticação Google, com as duas contas autorizadas pelo usuário.

O código antigo com Firebase foi revisado no commit
278fa677ebc3fad33e2841c92722f017701c8137. Foram recuperadas a leitura automática do
documento usuarios/gabriel-local e das subcoleções tarefas, historico, debugRoleta
e accelBoosts, preservando o visual e os recursos novos de notas, OCR, contrato,
catálogo editável, bônus, cronômetro, combos, redutores e roleta atual.

Não foram restaurados preços, probabilidades ou cooldowns antigos. O cooldown
atual permanece de três dias. Históricos e tarefas antigos são preservados sem
reprecificação nem duplicação. O documento original e as coleções são copiados
antes da migração. A lista pessoal não é inserida no código nem nas fixtures.

O endereço antigo Simulator encaminha para Wallet-Simulator por autorização
específica. Esse encaminhamento trata apenas do endereço antigo; a unificação real
da persistência está no transporte Firebase principal, não no redirecionamento.

Consulte FIREBASE-LOCAL.md para acesso, migração das notas locais e operações compartilhadas.
