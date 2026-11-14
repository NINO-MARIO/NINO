plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val ksPath: String? = System.getenv("NINO_KEYSTORE")

// Passed by CI (-PninoRepo=owner/name -PninoVersionCode=N -PninoVersionName=x.y.z). Local builds fall back to the defaults.
// ninoRepo pins over-the-air updates to this repository; when empty the web layer must supply it.
val ninoRepo: String = (project.findProperty("ninoRepo") as String?)
    ?.takeIf { Regex("^[A-Za-z0-9._-]{1,100}/[A-Za-z0-9._-]{1,100}$").matches(it) } ?: ""
val ninoCode: Int = (project.findProperty("ninoVersionCode") as String?)?.toIntOrNull() ?: 2900
val ninoName: String = (project.findProperty("ninoVersionName") as String?)
    ?.takeIf { Regex("^[0-9A-Za-z._+-]{1,32}$").matches(it) } ?: "1.0.0"

android {
    namespace = "app.nino"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.nino"
        minSdk = 26
        targetSdk = 34
        versionCode = ninoCode
        versionName = ninoName
        buildConfigField("String", "NINO_REPO", "\"$ninoRepo\"")
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (ksPath != null && File(ksPath).exists()) {
            create("nino") {
                storeFile = File(ksPath)
                storePassword = System.getenv("NINO_KS_PASS")
                keyAlias = System.getenv("NINO_KEY_ALIAS")
                keyPassword = System.getenv("NINO_KEY_PASS")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("nino")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
    // WindowCompat / WindowInsetsControllerCompat: hide the system bars while the game is open (MainActivity.syncImmersive)
    implementation("androidx.core:core:1.13.1")
}
