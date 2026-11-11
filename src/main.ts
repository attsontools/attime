import { createApp } from 'vue';
import App from './App.vue';
import { host } from '@host';
import './styles.css';

createApp(App, { host }).mount('#app');

