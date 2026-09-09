{
  description = "2004lite devshell: bun, node, playwright deps";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = with pkgs; [
          bun
          nodejs_24
        ];
        shellHook = ''
          echo "2004lite devshell: bun $(bun --version), node $(node --version)"
        '';
      };
    };
}
