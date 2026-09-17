package com.absolutezero.usbrelay

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(UsbRelayPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
