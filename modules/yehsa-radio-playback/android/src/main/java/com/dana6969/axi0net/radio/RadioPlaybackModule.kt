package com.dana6969.axi0net.radio

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RadioPlaybackModule : Module() {
  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)
    Events(EVENT)

    OnCreate {
      instance = this@RadioPlaybackModule
    }

    OnDestroy {
      if (instance === this@RadioPlaybackModule) instance = null
    }

    Function("start") { title: String, artist: String ->
      val ctx = appContext.reactContext ?: appContext.currentActivity ?: return@Function false
      instance = this@RadioPlaybackModule
      val intent = Intent(ctx, RadioPlaybackService::class.java).apply {
        action = RadioPlaybackService.ACTION_START
        putExtra(RadioPlaybackService.EXTRA_TITLE, title)
        putExtra(RadioPlaybackService.EXTRA_ARTIST, artist)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent)
      else ctx.startService(intent)
      true
    }

    Function("stop") {
      val ctx = appContext.reactContext ?: appContext.currentActivity ?: return@Function false
      ctx.stopService(Intent(ctx, RadioPlaybackService::class.java))
      true
    }

    Function("setPaused") { paused: Boolean ->
      RadioPlaybackService.updatePaused(paused)
      true
    }
  }

  companion object {
    const val MODULE_NAME = "YehsaRadioPlayback"
    const val EVENT = "onRadioCommand"

    @Volatile
    var instance: RadioPlaybackModule? = null

    fun emit(action: String) {
      instance?.sendEvent(EVENT, mapOf("action" to action))
    }
  }
}
