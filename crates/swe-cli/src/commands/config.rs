//! Configuration commands.

use clap::{Args, Subcommand};
use swe_core::config;

#[derive(Args)]
pub struct ConfigArgs {
    #[command(subcommand)]
    command: ConfigCommand,
}

#[derive(Subcommand)]
enum ConfigCommand {
    /// Initialize default configuration
    Init,
    /// Set a configuration value
    Set {
        /// Key (e.g., "llm.provider", "llm.model")
        key: String,
        /// Value
        value: String,
    },
    /// Show current configuration
    Show,
}

pub async fn execute(args: ConfigArgs) -> anyhow::Result<()> {
    let config_dir = config::dirs_path();
    let config_path = config_dir.join("config.toml");

    match args.command {
        ConfigCommand::Init => {
            if config_path.exists() {
                println!("⚠️  Config already exists at {:?}", config_path);
                println!("  Use `swe config show` to view it.");
            } else {
                let config = swe_core::Config::default();
                config.save(&config_path)?;
                println!("✅ Created default config at {:?}", config_path);
            }
        }
        ConfigCommand::Set { key, value } => {
            println!("Setting {} = {}", key, value);
            // TODO: Load config, update key, save
            println!("[Stub — manual editing at {:?}]", config_path);
        }
        ConfigCommand::Show => {
            match swe_core::Config::load_default() {
                Ok(config) => {
                    let toml = toml::to_string_pretty(&config)?;
                    println!("{}", toml);
                }
                Err(_) => {
                    println!("No config found. Run `swe config init` to create one.");
                }
            }
        }
    }
    Ok(())
}
