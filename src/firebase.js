import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAPHvUIsakvV4-J9zQEWiDKlJUiYcxerUc",
  authDomain: "daihugo-ecb8f.firebaseapp.com",
  databaseURL: "https://daihugo-ecb8f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "daihugo-ecb8f",
  storageBucket: "daihugo-ecb8f.firebasestorage.app",
  messagingSenderId: "411097672383",
  appId: "1:411097672383:web:a5469e374dc5ebd197f40a"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
  
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
