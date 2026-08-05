# Overview

This project is intended to create a Github Action to deploy SFTPGo administration artifacts to an SFTPGo Server via API.

It will use the [SFTPGo OpenAPI Spec](./openapi.yaml) to push the changes to the target server.

The Action will need to have these configuration options:
* Server URL (string as URL)
* Authentication Method (Username/password or API Key) (determines other required options)
  * Username/password:
    * Username (string)
    * Password (secure string - should be masked from Github output)
  * API Key:
    * API Key Value (secure string - should be masked from Github output)
* Project Path (string)
* Retain extra Artifacts (Boolean, optional, default True)
* Simulate  (Boolean, optional, default True)

It will initially deploy these SFTPGO Artifacts:
* Virtual Folders (with yaml files found in a VirtualFolders folder in the root of the Project Path Option)
* Groups (with yaml files found in a Groups folder in the root of the Project Path Option)

The definition of the values to post to the API will be stored as YAML.
Refer to the VS Code extension that masters these artifacts [VS Code Sftpgo config extension](https://github.com/linkedupbits/sftpgo_config_extension) if there are questions about how they are serialised/structured.

If the Simulate option is true, the Github Action will print out what it would do based on the project, but not do anything

If the Retain extra Artifacts is True, existing artifacts that do not appear in the project would be retained. If it is false, the Action would remove non-mapped artifacts from the target server.

Ensure there is unit testing for the action.
