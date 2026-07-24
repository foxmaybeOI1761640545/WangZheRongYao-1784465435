import { createApp } from 'vue'
import './style.css'
import './layout.css'
import './server-list.css'
import './refinements.css'
import './android.css'
import './home-layout.css'
import './mobile-header.css'
import App from './App.vue'
import UpdateLauncher from './components/UpdateLauncher.vue'
import {
  installFormEnterNavigation,
  installNativeBackBridge,
} from './platform/nativeAppShell.js'

installFormEnterNavigation()
void installNativeBackBridge()

createApp(App).mount('#app')

const updateRoot = document.createElement('div')
updateRoot.id = 'app-update-root'
document.body.appendChild(updateRoot)
createApp(UpdateLauncher).mount(updateRoot)