import { createApp } from 'vue'
import './style.css'
import './layout.css'
import './server-list.css'
import './refinements.css'
import './android.css'
import App from './App.vue'
import {
  installFormEnterNavigation,
  installNativeBackBridge,
} from './platform/nativeAppShell.js'

installFormEnterNavigation()
void installNativeBackBridge()

createApp(App).mount('#app')
