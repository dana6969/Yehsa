package com.dana6969.axi0net.radio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.media.app.NotificationCompat as MediaNotificationCompat

class RadioPlaybackService : Service() {
  private var mediaSession: MediaSessionCompat? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var title: String = "Yehsa Radio"
  private var artist: String = "Yehsa"
  private var paused: Boolean = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = this
    val session = MediaSessionCompat(this, SESSION_TAG)
    session.setCallback(object : MediaSessionCompat.Callback() {
      override fun onPlay() = handleCommand(ACTION_PLAY, emit = true)
      override fun onPause() = handleCommand(ACTION_PAUSE, emit = true)
      override fun onStop() = handleCommand(ACTION_STOP, emit = true)
    })
    session.isActive = true
    mediaSession = session
    val lock = (getSystemService(POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_TAG)
    lock.setReferenceCounted(false)
    lock.acquire()
    wakeLock = lock
    ensureChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        title = intent.getStringExtra(EXTRA_TITLE)?.ifBlank { null } ?: "Yehsa Radio"
        artist = intent.getStringExtra(EXTRA_ARTIST)?.ifBlank { null } ?: "Yehsa"
        paused = false
        startInForeground()
      }
      ACTION_PLAY -> handleCommand(ACTION_PLAY, emit = true)
      ACTION_PAUSE -> handleCommand(ACTION_PAUSE, emit = true)
      ACTION_STOP -> handleCommand(ACTION_STOP, emit = true)
      else -> if (running === this) startInForeground()
    }
    return START_STICKY
  }

  override fun onDestroy() {
    if (running === this) running = null
    release()
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    RadioPlaybackModule.emit(COMMAND_STOP)
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun handleCommand(action: String, emit: Boolean) {
    when (action) {
      ACTION_PLAY -> {
        paused = false
        startInForeground()
        if (emit) RadioPlaybackModule.emit(COMMAND_PLAY)
      }
      ACTION_PAUSE -> {
        paused = true
        startInForeground()
        if (emit) RadioPlaybackModule.emit(COMMAND_PAUSE)
      }
      ACTION_STOP -> {
        if (emit) RadioPlaybackModule.emit(COMMAND_STOP)
        stopSelf()
      }
    }
  }

  private fun startInForeground() {
    updateSession()
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun updateSession() {
    val session = mediaSession ?: return
    session.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, artist)
        .build()
    )
    val state = if (paused) PlaybackStateCompat.STATE_PAUSED else PlaybackStateCompat.STATE_PLAYING
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_STOP
        )
        .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, if (paused) 0f else 1f)
        .build()
    )
  }

  private fun buildNotification(): Notification {
    val playPauseAction = if (paused) {
      NotificationCompat.Action(android.R.drawable.ic_media_play, "Play", serviceIntent(ACTION_PLAY, 11))
    } else {
      NotificationCompat.Action(android.R.drawable.ic_media_pause, "Pause", serviceIntent(ACTION_PAUSE, 12))
    }
    val stopAction = NotificationCompat.Action(
      android.R.drawable.ic_menu_close_clear_cancel,
      "Stop",
      serviceIntent(ACTION_STOP, 13)
    )
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val contentIntent = launch?.let {
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
      PendingIntent.getActivity(this, 10, it, flags)
    }
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(artist)
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(!paused)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(contentIntent)
      .addAction(playPauseAction)
      .addAction(stopAction)
    mediaSession?.let { session ->
      builder.setStyle(
        MediaNotificationCompat.MediaStyle()
          .setMediaSession(session.sessionToken)
          .setShowActionsInCompactView(0, 1)
      )
    }
    return builder.build()
  }

  private fun serviceIntent(action: String, requestCode: Int): PendingIntent {
    val intent = Intent(this, RadioPlaybackService::class.java).setAction(action)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    return PendingIntent.getService(this, requestCode, intent, flags)
  }

  private fun immutableFlag(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Yehsa radio",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "Playing internet radio while the phone is locked"
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun release() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE)
      else @Suppress("DEPRECATION") stopForeground(true)
    } catch (_: Exception) {
    }
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    if (wakeLock?.isHeld == true) wakeLock?.release()
    wakeLock = null
  }

  companion object {
    const val ACTION_START = "com.dana6969.axi0net.radio.START"
    const val ACTION_PLAY = "com.dana6969.axi0net.radio.PLAY"
    const val ACTION_PAUSE = "com.dana6969.axi0net.radio.PAUSE"
    const val ACTION_STOP = "com.dana6969.axi0net.radio.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_ARTIST = "artist"
    const val COMMAND_PLAY = "play"
    const val COMMAND_PAUSE = "pause"
    const val COMMAND_STOP = "stop"
    const val CHANNEL_ID = "yehsa_radio_playback"
    const val SESSION_TAG = "YehsaRadio"
    const val WAKE_TAG = "YehsaRadioPlayback:wake"
    const val NOTIFICATION_ID = 7101
    const val SERVICE_NAME = "com.dana6969.axi0net.radio.RadioPlaybackService"

    @Volatile
    private var running: RadioPlaybackService? = null

    fun updatePaused(paused: Boolean) {
      val service = running ?: return
      service.paused = paused
      service.startInForeground()
    }
  }
}
