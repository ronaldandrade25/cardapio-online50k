// =====================================================================
//  CONFIGURAÇÃO DO FIREBASE
//  1. Crie um projeto em https://console.firebase.google.com
//  2. Adicione um "App Web" e copie o objeto firebaseConfig para baixo
//  3. Ative Authentication (E-mail/senha) e Firestore Database
//
//  Enquanto apiKey estiver vazia, o sistema roda em MODO DEMO:
//  os dados ficam salvos só neste navegador (localStorage), ótimo para testar.
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyC-UigG6Yn1kS2kCZM_BVkQ8HScNpN_dqA",
  authDomain: "cardapio-oline50k.firebaseapp.com",
  projectId: "cardapio-oline50k",
  storageBucket: "cardapio-oline50k.firebasestorage.app",
  messagingSenderId: "547302055401",
  appId: "1:547302055401:web:876f43504e111dfefcff78"
};

// E-mail do SUPERADMIN (dono do sistema). Crie esse usuário em Firebase › Authentication › Usuários.
// Deve ser o mesmo e-mail que está no topo do arquivo firestore.rules (função superadmin).
// Os demais usuários são cadastrados por ele em Configurações › Equipe (coleção "equipe").
export const SUPERADMIN_EMAIL = "rasistema25@gmail.com";

export const DEMO =!firebaseConfig.apiKey;

// Versão do SDK do Firebase carregada via CDN (não precisa de npm)
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2";
