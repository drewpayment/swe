//! Chat command — the conversational front door.

use clap::Args;

/// Open a chat session with the orchestrator.
#[derive(Args)]
pub struct ChatArgs {
    /// Agent to chat with (default: orchestrator)
    pub agent: Option<String>,
    /// Scope to a specific project
    #[arg(long)]
    pub project: Option<String>,
}

pub async fn execute(args: ChatArgs, api_url: &str) -> anyhow::Result<()> {
    let target = args.agent.as_deref().unwrap_or("orchestrator");
    
    if let Some(project) = &args.project {
        println!("🤖 Connected to {} (project: {})", target, project);
    } else {
        println!("🤖 Hey! I'm your SWE orchestrator. What are you working on?");
    }
    println!();

    // Interactive chat loop
    loop {
        let mut input = String::new();
        print!("You: ");
        use std::io::Write;
        std::io::stdout().flush()?;
        std::io::stdin().read_line(&mut input)?;
        
        let input = input.trim();
        if input.is_empty() || input == "exit" || input == "quit" {
            println!("👋 See you later!");
            break;
        }

        // TODO: Send message to API and stream response
        println!("🤖 [Chat is a stub — connect to SWE API at {} to enable]", api_url);
        println!();
    }

    Ok(())
}
