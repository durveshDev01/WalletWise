/**
 * Expo config. Settings that come from environment variables are read at build time:
 * locally from .env, on EAS Build from the EAS environment variables of the build
 * profile's environment (see eas.json and server/DEPLOY.md). Keys are never committed.
 *
 * The Best Card map is Mapbox GL JS in a WebView, so no Google Maps key is needed.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => config as ExpoConfig;
