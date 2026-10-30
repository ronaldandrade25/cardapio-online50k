# Cardápio Online

Cardápio digital com painel administrativo completo para restaurantes, lanchonetes e similares.

- **Front-end:** HTML, CSS e JavaScript puro (módulos ES), sem build e sem npm
- **Banco de dados e login:** Firebase (Firestore + Authentication), carregado por CDN
- **Hospedagem:** Vercel (arquivos estáticos + 2 funções serverless para prévia de links)
- **PWA:** instalável no celular e funciona offline (página de aviso)

## Sumário

1. [Endereços do sistema](#1-endereços-do-sistema)
2. [Como o sistema funciona](#2-como-o-sistema-funciona)
3. [Testar sem Firebase (modo demo)](#3-testar-sem-firebase-modo-demo)
4. [Conectar ao Firebase (passo a passo)](#4-conectar-ao-firebase-passo-a-passo)
5. [Acesso ao painel (superadmin e equipe)](#5-acesso-ao-painel-superadmin-e-equipe)
6. [Regras de segurança do Firestore](#6-regras-de-segurança-do-firestore)
7. [Publicar na Vercel](#7-publicar-na-vercel)
8. [Funcionalidades](#8-funcionalidades)
9. [Estrutura de pastas](#9-estrutura-de-pastas)
10. [Coleções do Firestore](#10-coleções-do-firestore)
11. [Personalização](#11-personalização)
12. [Problemas comuns](#12-problemas-comuns)

---

## 1. Endereços do sistema

| Endereço | O que é |
|---|---|
| `/` | Cardápio do cliente |
| `/?mesa=5` | Cardápio no modo mesa (aberto pelo QR Code da mesa 5) |
| `/pedido.html?id=...` | Acompanhamento do pedido em tempo real |
| `/admin/` | Painel administrativo |
| `/p/ID` | Link de produto com prévia (foto e preço) ao compartilhar no WhatsApp |

---

## 2. Como o sistema funciona

```
 Cliente (celular)                    Painel (balcão / cozinha)
 index.html + js/cliente.js           admin/index.html + js/admin/*.js
          \                                   /
           \________  js/db.js  _____________/
                     (camada de dados única)
                          |
              +-----------+------------+
              |                        |
     js/config.js com apiKey      js/config.js vazio
     → Firebase (Firestore + Auth) → Modo demo (localStorage)
```

- **`js/config.js`** guarda as credenciais do Firebase. É o único arquivo que você precisa editar para conectar.
- **`js/db.js`** é a única camada que fala com o banco. Se `apiKey` estiver preenchida, usa o **Firestore**; se estiver vazia, usa o **localStorage** do navegador (modo demo). O resto do sistema não sabe a diferença.
- **Tempo real:** cliente e painel assinam as coleções do Firestore, então pedidos novos aparecem no painel e mudanças de status chegam ao cliente sem recarregar a página.
- **Pedidos:** o cliente cria o pedido com status `novo`. A equipe muda o status no painel (kanban). O cliente acompanha pelo link `pedido.html?id=...`.
- **Pagamento:** sempre na entrega ou retirada. O sistema só registra a forma escolhida (e o troco, se for dinheiro).
- **Fotos:** são comprimidas no navegador e salvas direto no Firestore. **Não é preciso ativar o Firebase Storage.**
- **Login:** apenas a equipe (dono e atendentes) faz login no painel, com e-mail e senha. O cliente não precisa de conta.
- **Prévia no WhatsApp:** `api/produto.js` e `api/imagem.js` rodam na Vercel, leem o produto no Firestore e devolvem uma página com as meta tags (Open Graph) para o link `/p/ID` mostrar foto e preço.

---

## 3. Testar sem Firebase (modo demo)

Enquanto `apiKey` estiver vazia em `js/config.js`, o sistema roda em **modo demo**: os dados ficam salvos só no navegador e já vem um cardápio de exemplo.

É preciso abrir por um servidor local (dar duplo clique no arquivo não funciona por causa dos módulos JavaScript):

```bash
npx serve .
```

- Cardápio: <http://localhost:3000>
- Painel: <http://localhost:3000/admin/> (qualquer e-mail e senha com 6 ou mais caracteres)

Dica: deixe o cardápio e o painel em abas lado a lado. Os pedidos aparecem no painel na hora.

> No modo demo os dados **não são compartilhados** entre dispositivos. Para uso real, conecte ao Firebase.

---

## 4. Conectar ao Firebase (passo a passo)

O plano gratuito (Spark) do Firebase é suficiente para começar.

### 4.1 Criar o projeto

1. Acesse <https://console.firebase.google.com> e entre com sua conta Google.
2. Clique em **Adicionar projeto**, dê um nome (ex.: `meu-cardapio`) e conclua. O Google Analytics é opcional.

### 4.2 Ativar o login por e-mail e senha

1. No menu lateral: **Criação › Authentication › Vamos começar**.
2. Aba **Método de login** › **E-mail/senha** › ative a primeira opção › **Salvar**.

### 4.3 Criar o banco Firestore

1. **Criação › Firestore Database › Criar banco de dados**.
2. Escolha o modo **produção** (as regras de segurança são aplicadas no passo 4.4).
3. Região: `southamerica-east1` (São Paulo). A região não pode ser alterada depois.

### 4.4 Publicar as regras de segurança

1. Em **Firestore Database › Regras**, apague todo o conteúdo.
2. Cole o conteúdo do arquivo [`firestore.rules`](firestore.rules).
3. Clique em **Publicar**.

> Sem este passo o sistema não funciona: com as regras padrão do modo produção, tudo é bloqueado.

### 4.5 Registrar o app web e copiar as credenciais

1. Na página inicial do projeto, clique no ícone **Web `</>`** (ou **Configurações do projeto** › engrenagem › **Seus apps** › **Web**).
2. Dê um apelido ao app (ex.: `cardapio-web`). **Não** marque o Firebase Hosting.
3. Copie o objeto `firebaseConfig` que o Firebase mostra:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "meu-cardapio.firebaseapp.com",
  projectId: "meu-cardapio",
  storageBucket: "meu-cardapio.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
```

### 4.6 Colar em `js/config.js`

Abra [`js/config.js`](js/config.js) e substitua os valores vazios pelos seus:

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "meu-cardapio.firebaseapp.com",
  projectId: "meu-cardapio",
  storageBucket: "meu-cardapio.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
```

Não altere o resto do arquivo. A linha `export const DEMO = !firebaseConfig.apiKey;` desliga o modo demo automaticamente quando a `apiKey` está preenchida.

> A `apiKey` do Firebase Web **não é segredo**: ela só identifica o projeto. Quem protege seus dados são as regras do passo 4.4.

### 4.7 Autorizar seus domínios

1. **Authentication › Configurações › Domínios autorizados › Adicionar domínio**.
2. Adicione o endereço da Vercel (ex.: `seu-cardapio.vercel.app`) e seu domínio próprio, se tiver. `localhost` já vem autorizado para testes.

### 4.8 Conferir se conectou

1. Rode `npx serve .` e abra `/admin/`.
2. Entre com o superadmin (próxima seção).
3. No console do Firebase, em **Firestore Database › Dados**, devem aparecer coleções como `config` (depois de salvar algo no painel) e `equipe` (depois de cadastrar alguém). Se aparecerem, a conexão está funcionando.

---

## 5. Acesso ao painel (superadmin e equipe)

O acesso funciona em dois níveis:

| Quem | Onde é cadastrado | Como entra |
|---|---|---|
| **Superadmin** (dono do sistema) | Só em **Authentication › Usuários** do Firebase. O e-mail dele está nas regras e no `js/config.js` | Entra em `/admin/` com e-mail e senha. Não precisa estar na coleção `equipe` |
| **Dono extra / Atendentes** | Pelo painel, em **Configurações › Equipe**. O sistema cria o login e grava o documento em `equipe` | Entram em `/admin/`; o sistema confere se o `uid` existe em `equipe` |

### 5.1 Criar o superadmin

1. Defina o e-mail do superadmin em **dois** lugares (têm de ser iguais):
   - [`js/config.js`](js/config.js): `SUPERADMIN_EMAIL`
   - [`firestore.rules`](firestore.rules): função `superadmin()`, no topo
2. Publique as regras (Firestore › Regras › Publicar).
3. No Firebase: **Authentication › Usuários › Adicionar usuário**, com esse e-mail e uma senha.
4. Abra `/admin/` e entre com esse e-mail e senha. Pronto: não existe "primeiro acesso" nem cadastro público.

> Crie o usuário do superadmin logo após publicar. Enquanto ele não existir no Authentication, o e-mail está livre para quem usar o SDK do Firebase.

### 5.2 Cadastrar o restante da equipe

Logado como superadmin, vá em **Configurações › Equipe › Adicionar pessoa** e informe nome, e-mail, senha inicial e perfil. Quem não estiver em `equipe` (e não for o superadmin) vê "Sua conta não tem acesso ao painel".

| Perfil | Pode |
|---|---|
| **Superadmin / Dono** | Tudo: configurações, cupons, bairros, financeiro, equipe |
| **Atendente** | Pedidos, mesas, produtos e categorias, clientes, pausar/reabrir a loja |

Opcional: em **Configurações › Link e QR do cardápio**, clique em **Carregar dados de exemplo** para começar com um cardápio pronto para editar.

---

## 6. Regras de segurança do Firestore

O arquivo [`firestore.rules`](firestore.rules) define quem pode ler e escrever em cada coleção. Resumo:

| Coleção | Cliente (sem login) | Equipe | Dono |
|---|---|---|---|
| `config`, `categorias`, `produtos`, `adicionais`, `bairros` | Lê | Escreve (exceto `config`/`bairros`: só pausar a loja) | Escreve tudo |
| `cupons` | Consulta pelo código exato, não lista | Atualiza só o contador de usos | Tudo |
| `fidelidade` | Consulta pelo telefone exato | Lista e escreve | Tudo |
| `clientes` | Sem acesso | Lê e escreve | Tudo |
| `mesas` | Lê; só pode chamar garçom ou pedir a conta | Escreve | Tudo |
| `pedidos` | Cria (status `novo`) e acompanha pelo ID | Lista e altera | Tudo |
| `contas_pagar`, `contas_receber` | Sem acesso | Sem acesso | Tudo |
| `equipe` | Sem acesso | Lê | Escreve (cadastra e-mail e perfil) |

Sempre que mudar o arquivo `firestore.rules`, publique de novo no console (Firestore › Regras).

---

## 7. Publicar na Vercel

1. Crie uma conta em <https://vercel.com>.
2. Envie a pasta pelo GitHub (importando o repositório) ou pela CLI:
   ```bash
   npx vercel
   ```
   Framework: **Other**. Não há comando de build.
3. Em **Settings › Environment Variables**, crie (necessário para a prévia de produtos no WhatsApp):

   | Variável | Valor |
   |---|---|
   | `FIREBASE_PROJECT_ID` | o `projectId` do `js/config.js` |
   | `FIREBASE_API_KEY` | a `apiKey` do `js/config.js` |

4. Faça um novo deploy para as variáveis valerem:
   ```bash
   npx vercel --prod
   ```
5. Troque `SEU-DOMINIO` em [`robots.txt`](robots.txt) e [`sitemap.xml`](sitemap.xml) pelo endereço real.
6. Volte ao Firebase e confirme que o domínio da Vercel está em **Authentication › Domínios autorizados** (passo 4.7).

O [`vercel.json`](vercel.json) já configura a rota `/p/:id`, o cabeçalho do service worker e o `noindex` do painel.

---

## 8. Funcionalidades

**Cliente**
- Cardápio com categorias fixas no topo, busca, destaques, selos (Mais vendido, Promoção, Novo, Vegano, Picante) e preço promocional
- Adicionais obrigatórios e opcionais (mínimo e máximo), observação por item
- Sacola com upsell inteligente (sugere o que falta, como bebida ou sobremesa)
- Cupons (percentual, valor fixo, frete grátis, mínimo, validade, limite de usos)
- Fidelidade: a cada pedido finalizado o cliente ganha 1 ponto pelo WhatsApp; ao atingir a meta, usa a recompensa
- Delivery (taxa por bairro e pedido mínimo) ou retirada
- Pagamento sempre na entrega/retirada, com troco quando for dinheiro
- Status em tempo real no site e na página do pedido (com som e vibração)
- QR Code por mesa: pedir, chamar garçom e pedir a conta
- Horário automático (abre e fecha sozinho, inclusive virando a madrugada)
- Compartilhar produto e cardápio (WhatsApp ou compartilhamento nativo)
- SEO, Open Graph e dados estruturados (schema.org)
- PWA: instala na tela inicial

**Painel**
- Dashboard: faturamento, pedidos, ticket médio, gráfico, mais vendidos, tipos e formas de pagamento
- Pedidos em kanban em tempo real, com alerta sonoro repetido, notificação, impressão de comanda (58/80 mm) e cancelamento com motivo
- Mesas: chamados em tempo real, conta, fechar conta e QR Codes para imprimir
- Cardápio: produtos (foto, emoji, promoção, selos, adicionais, upsell, esgotado em 1 clique), categorias com ordem, grupos de adicionais
- Cupons e clientes/fidelidade (histórico, pontos, exportação CSV)
- Financeiro: resumo do mês, contas a pagar e a receber com parcelas, recorrência mensal, vencidas e CSV
- Entrega: delivery/retirada, tempos, mínimo e taxas por bairro
- Configurações: dados da loja, horários, cores da marca, formas de pagamento, upsell, SEO, equipe, link e QR do cardápio
- Botão para pausar a loja na hora

---

## 9. Estrutura de pastas

```
index.html  pedido.html  offline.html  admin/index.html
css/        base.css (tema e componentes) · cliente.css · admin.css
js/         config.js (Firebase) · db.js (dados: Firebase ou demo) · utils.js · seed.js
            cliente.js · pedido.js
js/admin/   app.js (menu, login, alertas) · pedidos · mesas · cardapio · cupons
            clientes · financeiro · dashboard · entrega · loja · acoes
api/        produto.js e imagem.js (prévia de links na Vercel) · _firestore.js
assets/     ícones do app e imagem de compartilhamento
sw.js  manifest.json  vercel.json  firestore.rules  robots.txt  sitemap.xml
```

---

## 10. Coleções do Firestore

Criadas automaticamente pelo uso do sistema; você não precisa criá-las à mão.

| Coleção | Conteúdo |
|---|---|
| `config` | Dados da loja, horários, cores, formas de pagamento, taxas, fidelidade, SEO |
| `categorias` | Categorias do cardápio e ordem |
| `produtos` | Produtos, preços, fotos, selos, adicionais vinculados |
| `adicionais` | Grupos de adicionais (obrigatórios e opcionais) |
| `bairros` | Bairros atendidos e taxa de entrega |
| `cupons` | Cupons de desconto (o ID é o código) |
| `pedidos` | Pedidos e status |
| `contadores` | Numeração sequencial dos pedidos (#1, #2, ...) |
| `mesas` | Mesas, chamados de garçom e pedido de conta |
| `clientes` | Cadastro de clientes (o ID é o telefone) |
| `fidelidade` | Pontos de fidelidade (o ID é o telefone) |
| `contas_pagar` / `contas_receber` | Financeiro |
| `equipe` | Usuários do painel e perfil (dono/atendente) |

---

## 11. Personalização

- **Cores e dados da loja:** no painel, em **Configurações**.
- **Imagem de compartilhamento:** substitua `assets/og-image.png` (1200×630) por uma foto da sua loja.
- **Ícones do app:** substitua `assets/icon-192.png`, `icon-512.png` e `icon.svg` pelo seu logo.
- **Atualizou o site?** Aumente `VERSAO` em [`sw.js`](sw.js) (ex.: `co-v2`) para os celulares baixarem a versão nova.
- **Som de pedidos:** no painel, clique em **Ativar som** uma vez (o navegador exige um clique para liberar áudio). Deixe a aba do painel aberta no computador ou tablet do balcão.

---

## 12. Problemas comuns

| Sintoma | Causa provável e solução |
|---|---|
| Tela em branco ao abrir o `index.html` com duplo clique | Módulos JS exigem servidor. Use `npx serve .` |
| Continua em modo demo depois de configurar | `apiKey` vazia em `js/config.js`, ou o navegador usa cache. Recarregue com Ctrl+F5 e, se preciso, aumente `VERSAO` em `sw.js` |
| `Missing or insufficient permissions` | Regras não publicadas ou desatualizadas. Refaça o passo 4.4 |
| `auth/unauthorized-domain` ao entrar no painel | Domínio não autorizado. Veja o passo 4.7 |
| `auth/operation-not-allowed` | E-mail/senha não ativado no Authentication (passo 4.2) |
| "Sua conta não tem acesso ao painel" | O login existe, mas o e-mail não é o do superadmin e não está em `equipe`. Entre com o superadmin e cadastre a pessoa em Configurações › Equipe. Se for o superadmin, confira se o e-mail é idêntico em `js/config.js` e em `firestore.rules`, e se as regras foram publicadas |
| Pedidos não aparecem no painel | Conta sem documento em `equipe/{uid}`, ou regras antigas |
| Link `/p/ID` sem foto/preço no WhatsApp | Faltam `FIREBASE_PROJECT_ID` e `FIREBASE_API_KEY` na Vercel, ou falta redeploy. O WhatsApp também guarda cache; teste com outro produto |
| Celular não atualiza o site | Service worker em cache. Aumente `VERSAO` em `sw.js` |
